import type Board from '../board'
import Constraint, { ConstraintResult } from './constraint'
import { registerConstraint } from '../constraint-builder'
import { cellIndexFromAddress } from '../solve-worker'
import { cellName, combinations, hasValue, maskToString, valueBit, valuesList } from '../solve-utility'

export default class RenbanLineConstraint extends Constraint {
  constructor(board: Board, params: { cells: any[] }) {
    const cells = params.cells.map(
      cellAddress => cellIndexFromAddress(cellAddress, board.size),
    ).sort((a, b) => a - b)
    super(
      board,
      'Renban Line',
      `Renban Line at ${cellName(cells[0], board.size)}`,
    )

    this.cells = cells
  }

  cells: number[]

  init(board: Board, isRepeat: boolean) {
    if (this.cells.length <= 1) return ConstraintResult.UNCHANGED
    if (this.cells.length === 2) {
      // handle the renban line via weak links
      const cell1 = this.cells[0]
      const cell2 = this.cells[1]
      const cell1UsedValues = Array.from({ length: board.size + 1 }, () => false)
      const cell2UsedValues = Array.from({ length: board.size + 1 }, () => false)

      for (let value1 = 1; value1 <= board.size; value1 += 1) {
        if (!hasValue(board.cells[cell1], value1)) continue
        const cell1Candidate = board.candidateIndex(cell1, value1)

        for (let value2 = 1; value2 <= board.size; value2 += 1) {
          if (!hasValue(board.cells[cell2], value2)) continue
          const cell2Candidate = board.candidateIndex(cell2, value2)

          if (Math.abs(value1 - value2) !== 1) {
            if (!board.isWeakLink(cell1Candidate, cell2Candidate) && !isRepeat) {
              board.addWeakLink(cell1Candidate, cell2Candidate)
            }
          } else {
            cell1UsedValues[value1] = true
            cell2UsedValues[value2] = true
          }
        }
      }

      const cell1Mask = cell1UsedValues.reduce((mask, used, value) => (used ? mask | valueBit(value) : mask), 0)
      const cell2Mask = cell2UsedValues.reduce((mask, used, value) => (used ? mask | valueBit(value) : mask), 0)

      return Math.max(
        board.keepCellMask(cell1, cell1Mask),
        board.keepCellMask(cell2, cell2Mask),
      ) as 0|1|2
    }

    if (!isRepeat) {
      board.addRegion(
        'Renban Line',
        this.cells,
        'renban',
        this,
      )
    }

    // if size is at board size, just treat is as a region
    if (this.cells.length >= board.size) return isRepeat ? ConstraintResult.UNCHANGED : ConstraintResult.CHANGED

    const allCellsMask = this.cells.reduce((mask, cell) => mask | board.cells[cell], board.givenBit)
    const maxStartValue = board.size - this.cells.length + 1
    let allCombosMask = board.givenBit
    for (let startValue = 1; startValue <= maxStartValue; startValue += 1) {
      const endValue = startValue + this.cells.length - 1
      const comboMask = this.maskBetweenInclusive(startValue, endValue)

      if ((comboMask & allCellsMask) !== comboMask) continue
      allCombosMask |= comboMask
    }

    return Math.max(
      ...this.cells.map(
        (cell) => board.keepCellMask(cell, allCombosMask),
      ),
      isRepeat ? ConstraintResult.UNCHANGED : ConstraintResult.CHANGED,
    ) as 0|1|2
  }

  logicStep(board: Board, logicStepDescription: null|string[]) {
    if (this.cells.length <= 2) return ConstraintResult.UNCHANGED
    if (this.cells.length >= board.size) return ConstraintResult.UNCHANGED
    if (this.isComplete(board)) return ConstraintResult.UNCHANGED

    const knownValues = this.knownValues(board)
    const validCombos = this.possibleComboMasks(board)
    const validComboMask = validCombos.reduce((mask, comboMask) => mask | comboMask, board.givenBit)

    const results = this.cells.map((cell) => board.keepCellMask(cell, validComboMask))
    if (results.some((res) => res === ConstraintResult.INVALID)) {
      logicStepDescription?.push(`${this.specificName} has no valid combinations.`)
      return ConstraintResult.INVALID
    }

    if (results.some((res) => res === ConstraintResult.CHANGED)) {
      const cellNames = results.reduce(
        (names, result, i) => {
          if (result !== ConstraintResult.CHANGED) return names
          return [
            ...names,
            cellName(this.cells[i], board.size),
          ]
        },
        [] as string[],
      ).join(', ')

      logicStepDescription?.push(
        `${this.specificName} has no valid combinations that include ${maskToString(~validComboMask & this.allValues, board.size)}. Removing those values from ${cellNames}`
      )

      return ConstraintResult.CHANGED
    }

    const requiredMask = validCombos.reduce((mask, combo) => mask & combo, this.allValues)
    if (requiredMask !== 0) {
      const requiredVals = valuesList(requiredMask)
      const unresolvedVals: Record<number, Set<number>> = {}
      for (let value of requiredVals) {
        if (knownValues.includes(value)) continue

        const availableCells = this.cells.filter(
          (cell) => hasValue(board.cells[cell], value)
        )

        if (availableCells.length === 0) {
          logicStepDescription?.push(
            `${this.specificName} must include a ${value}, but it cannot be placed in any cells`
          )
          return ConstraintResult.INVALID
        }

        if (availableCells.length === 1) {
          logicStepDescription?.push(
            `${this.specificName} must include a ${value}, and it must be placed in ${cellName(availableCells[0], board.size)}`
          )
          board.setAsGiven(availableCells[0], value)
          return ConstraintResult.CHANGED
        } else {
          // look to see if all of these cells are in a region
          const availableCellRegions = board.regions.filter((region) => {
            if (region.fromConstraint === this) return false
            return availableCells.every((c) => region.cells.includes(c))
          })

          if (availableCellRegions.length) {
            const removeCells = availableCellRegions.reduce(
              (list, region) => {
                return [
                  ...list,
                  ...region.cells.filter((c) => !list.includes(c) && !availableCells.includes(c)),
                ]
              },
              [] as number[],
            )

            const results = removeCells.map(
              (cell) => board.clearCellMask(cell, valueBit(value)),
            )

            const invalidIndex = results.indexOf(ConstraintResult.INVALID)
            if (invalidIndex >= 0) {
              logicStepDescription?.push(
                `${this.specificName} must include ${value} in ${availableCells.map(c => cellName(c, board.size)).join(',')}, which breaks ${cellName(removeCells[invalidIndex], board.size)}`
              )
              return ConstraintResult.INVALID
            }

            const changedCells = results.reduce(
              (list, result, i) => {
                if (result !== ConstraintResult.CHANGED) return list
                return [
                  ...list,
                  removeCells[i],
                ]
              },
              [] as number[],
            )
            if (changedCells.length > 0) {
              const cellNames = changedCells.map(c => cellName(c, board.size)).join(', ')
              logicStepDescription?.push(
                `${this.specificName} must include ${value} in ${availableCells.map(c => cellName(c, board.size)).join(',')}, which removes that value from ${cellNames}`
              )
              return ConstraintResult.CHANGED
            }
          }

          unresolvedVals[value] = new Set(availableCells)
        }
      }
      
      const keys = Object.keys(unresolvedVals).map((v) => parseInt(v, 10))
      // look for groups
      for (let groupSize = 2; groupSize < requiredVals.length; groupSize += 1) {
        for (let group of combinations(keys, groupSize)) {
          const comboSet: Set<number> = new Set()
          for (let key of group) {
            unresolvedVals[key].forEach((c) => comboSet.add(c))
          }

          if (comboSet.size === groupSize) {
            // We found a set
            const setMask = group.reduce((mask: number, value: number) => mask | valueBit(value), board.givenBit)
            const cellArr = Array.from(comboSet)
            const results = cellArr.map(
              (cell) => board.keepCellMask(cell, setMask)
            )

            const invalidIndex = results.indexOf(ConstraintResult.INVALID)
            if (invalidIndex > 0) {
              logicStepDescription?.push(
                `${this.specificName} requires values ${maskToString(setMask, board.size)}, which makes ${cellName(cellArr[invalidIndex], board.size)} invalid.`
              )
              return ConstraintResult.INVALID
            }

            if (results.some((res) => res === ConstraintResult.CHANGED)) {
              logicStepDescription?.push(
                `${this.specificName} requires values ${maskToString(setMask, board.size)}, which must go in cells ${cellArr.map(c => cellName(c, board.size)).join(', ')}. Removing other candidates from those cells.`
              )
              return ConstraintResult.CHANGED
            }
          }
        }
      }
    }

    return ConstraintResult.UNCHANGED
  }

  private isComplete(board: Board) {
    const values = this.knownValues(board)
    if (values.length !== this.cells.length) return false
    return values.every(
      (value, i) => value === values[0] + i,
    )
  }

  private knownValues(board: Board) {
    return this.cells.reduce(
      (values, cell) => {
        if (!board.isGiven(cell)) return values
        const value = board.getValue(cell)
        return [...values, value].sort((a, b) => a - b)
      },
      [] as number[],
    )
  }

  private possibleComboMasks(board: Board) {
    let baseCombo = 0
    for (let i = 1; i <= this.cells.length; i += 1) {
      baseCombo |= valueBit(i)
    }
    
    const combos = [baseCombo]
    for (let i = 1; i < board.size - this.cells.length + 1; i += 1) {
      combos.push(baseCombo << i)
    }

    const allCellsMask = this.cells.reduce((mask, cell) => mask | board.cells[cell], 0)
    return combos.filter(
      (combo) => {
        if ((allCellsMask & combo) !== combo) return false

        const usedCells: Set<number> = new Set()
        const unresolvedVals: Record<number, Set<number>> = {}

        for (let value of valuesList(combo)) {
          const availableCells = this.cells.filter(
            (cell) => hasValue(board.cells[cell], value) && !usedCells.has(cell)
          )

          if (availableCells.length === 0) return false
          if (availableCells.length === 1) {
            usedCells.add(availableCells[0])
            for (let set of Object.values(unresolvedVals)) {
              set.delete(availableCells[0])
            }
          } else {
            unresolvedVals[value] = new Set(availableCells)
          }
        }

        while (Object.keys(unresolvedVals).length > 0) {
          const keys = Object.keys(unresolvedVals).map((v) => parseInt(v, 10))

          // check for any length 0 or 1
          let jumpToStart = false
          for (let key of keys) {
            const set = unresolvedVals[key]
            if (set.size === 0) return false
            if (set.size === 1) {
              const cell = Array.from(set)[0]
              usedCells.add(cell)
              delete unresolvedVals[key]
              for (let remKey of keys) {
                if (key === remKey) continue
                unresolvedVals[remKey].delete(cell)
              }
              jumpToStart = true
              break
            }
          }
          if (jumpToStart) continue

          // look for value groups that are equal
          let setFound = false
          for (let groupSize = 2; groupSize < keys.length; groupSize += 1) {
            if (setFound) break
            for (let group of combinations(keys, groupSize)) {
              const comboSet: Set<number> = new Set()
              for (let key of group) {
                const set = unresolvedVals[key]
                unresolvedVals[key].forEach((c) => comboSet.add(c))
              }

              if (comboSet.size === groupSize) {
                // We found a set
                setFound = true
                for (let key of keys) {
                  if (group.includes(key)) {
                    delete unresolvedVals[key]
                  } else {
                    comboSet.forEach((c) => unresolvedVals[key].delete(c))
                  }
                }
                comboSet.forEach((c) => usedCells.add(c))
                break
              }
            }
          }

          break
        }

        return true
      }
    )
  }
}

export function register() {
  registerConstraint(
    'renban',
    (board, params, definition) => {
      const lines: any[][] = definition?.lines ? definition.lines(params) : params.lines
      const cells = lines.reduce(
        (allCells, line) => [
          ...allCells,
          ...line.filter(
            (cell) => !allCells.includes(cell),
          ),
        ],
        [] as any[],
      )

      return new RenbanLineConstraint(
        board,
        { cells },
      )
    }
  )
}
