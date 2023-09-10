import type Board from '../board'
import Constraint, { ConstraintResult } from './constraint'
import { registerConstraint } from '../constraint-builder'
import { cellIndexFromAddress } from '../solve-worker'
import { cellName, combinations, hasValue, maskToString, valueBit } from '../solve-utility'
import { addressToCoordinates } from '@/utils/grid-helpers'

export default class KnownDigitsInCellsConstraint extends Constraint {
  constructor(constraintName: string, board: Board, params: { cells: number[], values: number[] }) {
    const cells = params.cells.map(
      cell => cellIndexFromAddress(cell, board.size)
    ).sort((a, b) => a - b)
    const addresses = cells.map(cell => board.cellCoords(cell).map(n => n + 1))
    const { rows, columns } = addresses.reduce(
      ({ rows, columns }, [row, col]) => {
        if (!rows.includes(row)) rows.push(row)
        if (!columns.includes(col)) columns.push(col)
        return { rows, columns }
      },
      { rows: [] as number[], columns: [] as number[] },
    )

    const specificName = `${constraintName} at R${rows.sort((a, b) => a - b).join('')}C${columns.sort((a, b) => a - b).join('')}`

    super(board, constraintName, specificName)

    this.cells = cells
    this.values = params.values
  }

  cells: number[]
  values: number[]

  init(board: Board, isRepeat: boolean) {
    if (this.values.length < 1) return ConstraintResult.UNCHANGED
    if (this.cells.length < 1) return ConstraintResult.UNCHANGED

    const unusedValues = this.unusedValues(board)
    const unsetCells = this.cells.filter((cell) => !board.isGiven(cell))
    if (unusedValues.length === 0) return ConstraintResult.UNCHANGED
    // if (unsetCells.length > unusedValues.length) return ConstraintResult.INVALID

    let changed = false
    if (unsetCells.length === unusedValues.length) {
      // all remaining cells must be used for remaining values
      const cellMask = unusedValues.reduce((mask, value) => mask | valueBit(value), 0)
      const results = unsetCells.map(
        (cell) => board.keepCellMask(cell, cellMask)
      )
      if (results.some(res => res === ConstraintResult.INVALID)) {
        return ConstraintResult.INVALID
      }
      if (results.some(res => res === ConstraintResult.CHANGED)) changed = true
    }

    return ConstraintResult.UNCHANGED
  }

  logicStep(board: Board, logicStepDesc: null|string[]) {
    if (this.values.length < 1) return ConstraintResult.UNCHANGED
    if (this.cells.length < 1) return ConstraintResult.UNCHANGED

    const unusedValues = this.unusedValues(board)
    const unsetCells = this.cells.filter((cell) => !board.isGiven(cell))
    if (unusedValues.length === 0) return ConstraintResult.UNCHANGED
    if (unsetCells.length < unusedValues.length) {
      logicStepDesc?.push(
        `${this.specificName} still needs ${unusedValues.join('')}, but only has ${unsetCells.length} empty cells left`
      )
      return ConstraintResult.INVALID
    }

    if (unsetCells.length === unusedValues.length) {
      // all remaining cells must be used for remaining values
      const cellMask = unusedValues.reduce((mask, value) => mask | valueBit(value), 0)
      const results = unsetCells.map(
        (cell) => board.keepCellMask(cell, cellMask)
      )

      const invalidIndex = results.indexOf(ConstraintResult.INVALID)
      if (invalidIndex >= 0) {
        logicStepDesc?.push(
          `${cellName(unsetCells[invalidIndex], board.size)} must be one of (${maskToString(cellMask, board.size)}) but it cannot be any of those values`
        )
        return ConstraintResult.INVALID
      }

      if (results.some(res => res === ConstraintResult.CHANGED)) {
        logicStepDesc?.push(
          `All remaining cells in ${this.specificName} must be one of (${unusedValues.join('')}). Removing other candidates from those cells`
        )
        return ConstraintResult.CHANGED
      }
    }

    // Check each value for where it can go
    const valueTrackers = Array.from(
      { length: board.size + 1 },
      () => ({
        placements: new Set() as Set<number>,
        count: 0,
      }),
    )
    unusedValues.forEach(v => valueTrackers[v].count += 1)

    for (let value = 1; value <= board.size; value += 1) {
      if (valueTrackers[value].count <= 0) continue

      const possibleCells = unsetCells.filter(
        (cell) => hasValue(board.cells[cell], value)
      )

      if (possibleCells.length === 0) {
        logicStepDesc?.push(
          `${this.specificName} still needs ${value}, but it cannot be placed in any of the remaining cells`,
        )
        return ConstraintResult.INVALID
      }

      if (possibleCells.length < valueTrackers[value].count) {
        logicStepDesc?.push(
          `${this.specificName} still needs multiple ${value}'s, but there are not enough places to place it.`
        )
        return ConstraintResult.INVALID
      }

      if (possibleCells.length === valueTrackers[value].count) {
        // Those cells must contain the value
        const cellNames = possibleCells.map(
          (cell) => cellName(cell, board.size)
        ).join(',')

        const results = possibleCells.map(
          (cell) => board.keepCellMask(cell, valueBit(value))
        )
        
        const invalidIndex = results.indexOf(ConstraintResult.INVALID)
        if (invalidIndex >= 0) {
          logicStepDesc?.push(
            `${cellNames} ${possibleCells.length > 1 ? 'must all' : 'must'} contain ${value} to satisfy ${this.specificName}, which is invalid`
          )
          return ConstraintResult.INVALID
        }

        if (results.some(res => res === ConstraintResult.CHANGED)) {
          logicStepDesc?.push(
            `${cellNames} ${possibleCells.length > 1 ? 'must all' : 'must'} contain ${value} to satisfy ${this.specificName}`
          )
          return ConstraintResult.CHANGED
        }
      }

      if (valueTrackers[value].count > 1) {
        // Check for groups within the possible cells
        const groups = board.splitIntoGroups(possibleCells)
        if (groups.length < valueTrackers[value].count) {
          logicStepDesc?.push(
            `${this.specificName} needs multiple ${value}'s, but there aren't enough cells that don't see each other to place them all`,
          )
          return ConstraintResult.INVALID
        }

        if (groups.length === valueTrackers[value].count) {
          const singleCellGroups = groups.filter(
            g => g.length === 1
          )

          if (singleCellGroups.length > 0) {
            const results = singleCellGroups.map(
              (group) => board.keepCellMask(group[0], valueBit(value))
            )

            const invalidIndex = results.indexOf(ConstraintResult.INVALID)
            if (invalidIndex >= 0) {
              logicStepDesc?.push(
                `${cellName(singleCellGroups[invalidIndex][0], board.size)} must contain a ${value} for ${this.specificName} to be valid`
              )
              return ConstraintResult.INVALID
            }

            if (results.some(res => res === ConstraintResult.CHANGED)) {
              const cellNames = singleCellGroups.map(
                (group) => cellName(group[0], board.size)
              ).join(',')
              logicStepDesc?.push(
                `${cellNames} must contain ${value} for ${this.specificName} to be valid`
              )
              return ConstraintResult.CHANGED
            }
          }

          for (let group of groups) {
            // group must contain value,
            // so we can remove value from any cells seen
            // by every member of the group

            const allSeenCells = group.reduce(
              (seen, cell) => [
                ...seen,
                ...board.seenCells(cell).filter((c) => !seen.includes(c)),
              ],
              [] as number[],
            )

            const seenByEveryMember = allSeenCells.filter(
              (cell) => {
                const seenCells = board.seenCells(cell)
                return group.every((check) => seenCells.includes(check))
              }
            )

            if (seenByEveryMember.length > 0) {
              const groupCellNames = group.map(
                (cell) => cellName(cell, board.size),
              ).join(',')
              const seenCellNames = seenByEveryMember.map(
                (cell) => cellName(cell, board.size),
              ).join(',')

              const results = seenByEveryMember.map(
                (cell) => board.clearCellMask(cell, valueBit(value))
              )

              const invalidIndex = results.indexOf(ConstraintResult.INVALID)
              if (invalidIndex >= 0) {
                logicStepDesc?.push(
                  `${this.specificName} must contain a ${value} in cells (${groupCellNames}), which causes ${cellName(seenByEveryMember[invalidIndex], board.size)} to have no valid candidates`
                )
                return ConstraintResult.INVALID
              }

              if (results.some(res => res === ConstraintResult.CHANGED)) {
                logicStepDesc?.push(
                  `${this.specificName} must contain a ${value} in cells (${groupCellNames}), which removes that candidate from ${seenCellNames}`
                )
                return ConstraintResult.CHANGED
              }
            }
          }
        }
      }

      possibleCells.forEach((c) => valueTrackers[value].placements.add(c))
    }

    const uniqUnusedVals = valueTrackers.reduce((vals, { count }, value) => {
      if (count === 0) return vals
      return [
        ...vals,
        value,
      ]
    }, [] as number[])

    // look for sets within the possible placements
    for (let countLookup = 2; countLookup < unusedValues.length; countLookup += 1) {
      for (let groupSize = 2; groupSize <= countLookup; groupSize += 1) {
        for (let combo of combinations(uniqUnusedVals, groupSize)) {
          const groupCount = combo.reduce((sum: number, value: number) => sum + valueTrackers[value].count, 0)
          if (groupCount !== countLookup) continue

          const groupPossibleCells: Set<number> = new Set()
          combo.forEach((value: number) => {
            valueTrackers[value].placements.forEach(c => groupPossibleCells.add(c))
          })
          if (groupPossibleCells.size > groupCount) continue

          const comboVals: string = combo.reduce((str: string, value: number) => `${str}${value.toString().repeat(valueTrackers[value].count)}`, '')

          if (groupPossibleCells.size < groupCount) {
            logicStepDesc?.push(
              `${this.specificName} must contain (${comboVals}), but there are only ${groupPossibleCells.size} cells that can contain those cells`
            )
            return ConstraintResult.INVALID
          }

          // the possible cells must contain exactly the combo values
          const cellsArr = Array.from(groupPossibleCells)
          const cellMask = combo.reduce((mask: number, value: number) => mask | valueBit(value), board.givenBit)
          const cellNames = cellsArr.map(
            (cell) => cellName(cell, board.size),
          ).join(',')

          const results = cellsArr.map(
            (cell) => board.keepCellMask(cell, cellMask),
          )

          const invalidIndex = results.indexOf(ConstraintResult.INVALID)
          if (invalidIndex >= 0) {
            logicStepDesc?.push(
              `${this.specificName} must contain (${comboVals}), and they must go exactly in ${cellNames}, which removes all values from ${cellName(cellsArr[invalidIndex], board.size)}`
            )
            return ConstraintResult.INVALID
          }

          if (results.some((res) => res === ConstraintResult.CHANGED)) {
            logicStepDesc?.push(
              `${this.specificName} must contain (${comboVals}), and they must go exactly in ${cellNames}, all other candidates removed`
            )
            return ConstraintResult.CHANGED
          }
        }
      }
    }

    return ConstraintResult.UNCHANGED
  }

  private unusedValues(board: Board) {
    const givenValueCounts = Array.from(
      { length: board.size + 1},
      () => 0
    )

    for (let cell of this.cells) {
      if (!board.isGiven(cell)) continue
      const value = board.getValue(cell)
      givenValueCounts[value] += 1
    }

    return this.values.reduce((values, value) => {
      if (givenValueCounts[value] > 0) {
        givenValueCounts[value] -= 1
        return values
      }

      return [...values, value]
    }, [] as number[])
  }
}

export function register() {
  registerConstraint(
    'quadruple',
    (board, params, definition) => {
      const cells: number[] = definition?.cells ? definition.cells(params) : params.cells
      const values: number[] = definition?.values ? definition.values(params) : params.values
      if (cells.length === 0) return []
      if (values.length === 0) return []

      return new KnownDigitsInCellsConstraint(
        'Quadruple',
        board,
        { cells, values },
      )
    }
  )
}
