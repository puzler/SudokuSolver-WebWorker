import type Board from '../board'
import Constraint, { ConstraintResult } from './constraint'
import { registerConstraint } from '../constraint-builder'
import { cellIndexFromAddress } from '../solve-worker'
import { cellName, hasValue, maskToString, maxValue, minValue, popcount, valueBit, valuesList } from '../solve-utility'
import SumCellsHelper from '../sum-cells-helper'
import SumGroup from '../sum-group'

export default class XSumConstraint extends Constraint {
  constructor(board: Board, params: { cells: any[], sum: number }) {
    const cells = params.cells.map(cell => cellIndexFromAddress(cell, board.size))
    const direction = Math.abs(cells[0] - cells[1]) === 1 ? 'Horizontal' : 'Vertical'
    const specificName = `${direction} X-Sum from ${cellName(cells[0], board.size)}`
    super(board, 'X-Sum', specificName)

    this.cells = cells
    this.sum = params.sum
    this.sumGroups = Array.from({ length: board.size - 2 }, (_, i) => i + 2).reduce(
      (groups, groupSize) => {
        const group = new SumGroup(board, this.cells.slice(1, groupSize), [groupSize])
        if (!group.isSumPossible(board, this.sum - groupSize)) return groups
        return [
          ...groups,
          group,
        ]
      },
      [] as SumGroup[],
    )
  }

  sum: number
  cells: number[]
  sumGroups: SumGroup[]

  init(board: Board, isRepeat: boolean) {
    if (isRepeat) return ConstraintResult.UNCHANGED

    if (this.sum === 1) {
      board.keepCellMask(this.cells[0], valueBit(1))
      return ConstraintResult.CHANGED
    }

    if (this.sum === this.maxSum) {
      if (isRepeat) return ConstraintResult.UNCHANGED
      
      board.keepCellMask(this.cells[0], valueBit(board.size))
      return ConstraintResult.CHANGED
    }

    if (this.sum <= 2 || this.sum === 4 || this.sum > this.maxSum) {
      return ConstraintResult.INVALID
    }

    if (board.isGiven(this.cells[0])) {
      const sumCellCount = board.getValue(this.cells[0])
      const sumHelper = new SumCellsHelper(board, this.cells.slice(1, sumCellCount))
      return sumHelper.init(board, [this.sum - sumCellCount])
    }

    const xCellMask = this.sumGroups.reduce((mask, group) => mask | valueBit(group.cells.length + 1), 0)
    return board.keepCellMask(this.cells[0], xCellMask)
  }

  logicStep(board: Board, logicStepDesc: null|string[]) {
    if (this.sum === 1 || this.sum === this.maxSum) return ConstraintResult.UNCHANGED
    if (this.sum <= 2 || this.sum === 4 || this.sum > this.maxSum) return ConstraintResult.INVALID

    if (board.isGiven(this.cells[0])) {
      const cellCount = board.getValue(this.cells[0])
      const sumHelper = new SumCellsHelper(board, this.cells.slice(1, cellCount))
      return sumHelper.logicStep(board, [this.sum - cellCount], logicStepDesc)
    }

    const maxLength = maxValue(board.cells[this.cells[0]])
    const possibleCellMasks = Array.from(
      { length: maxLength - 1 },
      () => 0,
    )
    const possibleSumComboMasks: number[] = []

    for (let group of this.sumGroups) {
      const groupLength = group.cells.length + 1
      if (!hasValue(board.cells[this.cells[0]], groupLength)) continue
      if (!group.isSumPossible(board, this.sum - groupLength)) {
        // Sum can no longer be this length. Remove candidate from x-cell
        const result = board.clearCellMask(this.cells[0], valueBit(groupLength))
        if (result !== ConstraintResult.UNCHANGED) {
          logicStepDesc?.push(`${this.specificName} cannot be length ${groupLength}. Removing candidate from the x-cell`)
          if (result === ConstraintResult.INVALID) {
            logicStepDesc?.push(`, which leaves no valid candidates. Board is invalid!`)
            return ConstraintResult.INVALID
          }
          return ConstraintResult.CHANGED
        }
      }

      const {
        masks,
        sumCombinations,
      } = group.restrictSumHelper(board, [this.sum - groupLength])
      for (let i = 0; i < masks.length; i += 1) {
        possibleCellMasks[i] |= masks[i]
      }

      if (sumCombinations) {
        possibleSumComboMasks.push(
          ...sumCombinations.reduce(
            (list, mask) => {
              const fullMask = mask | valueBit(popcount(mask) + 1)
              if (possibleSumComboMasks.includes(fullMask)) return list
              if (list.includes(fullMask)) return list
              return [
                ...list,
                fullMask
              ]
            },
            [] as number[],
          )
        )
      }
    }

    const guaranteedCellsCount = minValue(board.cells[this.cells[0]])
    let changed = false
    for (let i = 1; i < guaranteedCellsCount; i += 1) {
      const cell = this.cells[i]
      const clearMask = (this.allValues ^ possibleCellMasks[i - 1]) & board.cells[cell]
      if (clearMask === 0) continue
      
      const result = board.clearCellMask(cell, clearMask)
      if (result === ConstraintResult.UNCHANGED) continue

      if (!changed) {
        logicStepDesc?.push(
          `${this.specificName} removes candidates`
        )
        changed = true
      }

      logicStepDesc?.push(
        ` ${maskToString(clearMask, board.size)} from ${cellName(cell, board.size)},`
      )

      if (result === ConstraintResult.INVALID) {
        if (logicStepDesc?.length) {
          logicStepDesc[logicStepDesc.length - 1] = logicStepDesc[logicStepDesc.length - 1].slice(0, -1)
        }

        logicStepDesc?.push(
          `. ${cellName(cell, board.size)} has no remaining candidates. Board is invalid! `
        )


        return ConstraintResult.INVALID
      }
    }

    if (changed) {
      if (logicStepDesc?.length) {
        logicStepDesc[logicStepDesc.length - 1] = logicStepDesc[logicStepDesc.length - 1].slice(0, -1)
      }
      return ConstraintResult.CHANGED
    }

    const requiredDigits = possibleSumComboMasks.reduce((mask, sumCombo) => mask & sumCombo, this.allValues)
    if (requiredDigits !== 0) {
      const groupCells = this.cells.slice(0, maxLength)
      const requiredValueSeenCells: { value: number, cells: number[] }[] = []

      for (let value of valuesList(requiredDigits)) {
        // See what cells the value can go in
        const valueCells = groupCells.filter((cell, i) => {
          if (i === 0) return hasValue(board.cells[cell], value)
          return hasValue(possibleCellMasks[i - 1], value)
        })

        if (valueCells.length === 0) {
          logicStepDesc?.push(
            `Every combination for ${this.specificName} requires a ${value}, but that value cannot be placed in any cells. Board is Invalid!`
          )
          return ConstraintResult.INVALID
        }
        
        if (valueCells.length === 1) {
          const result = board.keepCellMask(valueCells[0], valueBit(value))
          if (result === ConstraintResult.UNCHANGED) continue

          logicStepDesc?.push(
            `Every combination for ${this.specificName} requires a ${value}, which must be in ${cellName(valueCells[0], board.size)}`
          )
          if (result === ConstraintResult.CHANGED) return ConstraintResult.CHANGED

          if (result === ConstraintResult.INVALID) {
            if (logicStepDesc) {
              logicStepDesc[0] += `, which is invalid`
            }
            return ConstraintResult.INVALID
          }
        }

        // Multiple possible cells, but we save the list of cells they all see to clear those values later
        const seenCells = valueCells.map(
          (cell) => board.seenCells(cell).filter(
            (checkCell) => {
              if (valueCells.includes(checkCell)) return false
              return hasValue(board.cells[checkCell], value)
            }
          )
        )
        const seenByAll = seenCells[0].filter(
          (cell) => seenCells.every((cellGroup) => cellGroup.includes(cell)),
        )
        if (seenByAll.length) requiredValueSeenCells.push({ value, cells: seenByAll })
      }

      // No singles found in sum groups, so we remove required vals from cells they see
      if (requiredValueSeenCells.length) {
        let clearedVals = 0
        for (let { value, cells } of requiredValueSeenCells) {
          const results = cells.map(
            (cell) => board.clearCellMask(cell, valueBit(value))
          )

          const invalidIndex = results.indexOf(ConstraintResult.INVALID)
          if (invalidIndex >= 0) {
            logicStepDesc?.push(
              `${this.specificName} must include a ${value} which removes that value from ${cellName(cells[invalidIndex], board.size)}, leaving it with no candidates. Board is invalid!`
            )
            return ConstraintResult.INVALID
          }

          if (results.some((res) => res === ConstraintResult.CHANGED)) clearedVals |= valueBit(value)
        }
        if (clearedVals !== 0) {
          logicStepDesc?.push(
            `Every combination for ${this.specificName} requires ${maskToString(clearedVals, board.size)}, removing candidates for cells that would break it`
          )
          return ConstraintResult.CHANGED
        }
      }
    }

    return ConstraintResult.UNCHANGED
  }

  get maxSum() {
    return valuesList(this.allValues).reduce((sum, v) => sum + v, 0)
  }
}

export function register() {
  registerConstraint(
    'xsum',
    (board, params, definition) => {
      const sum: null|undefined|number = definition?.value ? definition.value(params) : params.value
      if (sum === null || sum === undefined) return []

      let cells: null|undefined|any[]
      if (definition?.cells) {
        cells = definition.cells(params, board.size)
      } else if (params.cell) {
        const match = (params.cell as string).match(/^R(?<row>-{0,1}\d+)C(?<column>-{0,1}\d+)$/)
        if (!match?.groups) return []

        const { row: rawRow, column: rawColumn } = match.groups
        const row = parseInt(rawRow, 10)
        const column = parseInt(rawColumn, 10)
        if (!Number.isFinite(row) || !Number.isFinite(column)) return []

        const isColumnClue = row <= 0 || row > board.size
        const isRowClue = column <= 0 || column > board.size
        if (isRowClue && isColumnClue) return []

        if (isRowClue) {
          cells = Array.from(
            { length: board.size },
            (_, i) => `R${row}C${row === 0 ? i + 1 : board.size - i}`,
          )
        } else if (isColumnClue) {
          cells = Array.from(
            { length: board.size },
            (_, i) => `R${column === 0 ? i + 1 : board.size - i}C${column}`
          )
        }
      }
      if (!cells?.length) return []
      
      return new XSumConstraint(
        board,
        { cells, sum },
      )
    }
  )
}
