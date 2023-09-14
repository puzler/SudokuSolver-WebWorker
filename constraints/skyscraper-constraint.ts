import type Board from '../board'
import Constraint, { ConstraintResult } from './constraint'
import { registerConstraint } from '../constraint-builder'
import { cellIndexFromAddress } from '../solve-worker'
import { cellName, hasValue, maxValue, minValue, valueBit } from '../solve-utility'

export default class SkyscraperConstraint extends Constraint {
  constructor(board: Board, params: { cells: any[], value: number }) {
    const cells = params.cells.map(cellAddress => cellIndexFromAddress(cellAddress, board.size))
    const direction = Math.abs(cells[0] - cells[1]) < board.size ? 'Horizontal' : 'Vertical'
    const specificName = `${direction} Skyscraper from ${cellName(cells[0], board.size)}`
    super(board, 'Skyscaper', specificName)

    this.cells = cells
    this.value = params.value
  }

  cells: number[]
  value: number

  init(board: Board, isRepeat: boolean) {
    if (this.value <= 0 || this.value > board.size) return ConstraintResult.INVALID
    if (isRepeat) return ConstraintResult.UNCHANGED

    if (this.value === 1) {
      board.keepCellMask(this.cells[0], valueBit(board.size))
      return ConstraintResult.CHANGED
    }

    if (this.value === board.size) {
      for (let i = 1; i <= board.size; i += 1) {
        board.keepCellMask(this.cells[i - 1], valueBit(i))
      }
      return ConstraintResult.CHANGED
    }

    let changed = false
    for (let i = 0; i < this.value - 1; i += 1) {
      const clearMask = this.maskStrictlyHigher((board.size - this.value + 1) + i)
      const result = board.clearCellMask(this.cells[i], clearMask)
      if (result === ConstraintResult.INVALID) return ConstraintResult.INVALID
      if (result === ConstraintResult.CHANGED) changed = true
    }

    return changed ? ConstraintResult.CHANGED : ConstraintResult.UNCHANGED
  }

  logicStep(board: Board, logicStepDesc: null|string[]) {
    if (this.value <= 0 || this.value > board.size) return ConstraintResult.INVALID
    if (this.value === 1 || this.value === board.size) return ConstraintResult.UNCHANGED
    let changed = false

    const cellsStatus: number[] = []
    let minOffset = 0
    let maxPossibleSeen = 0
    for (let i = 1; i <= board.size; i += 1) {
      const cell = this.cells[i - 1]
      const minCellValue = minValue(board.cells[cell] & this.allValues)
      const maxCellValue = maxValue(board.cells[cell] & this.allValues)

      const minSeen = i + minOffset
      if (maxCellValue < minSeen) {
        cellsStatus.push(-1)
        if (minOffset > 0) minOffset -= 1
      } else if (minCellValue > maxPossibleSeen) {
        cellsStatus.push(1)
        minOffset = minCellValue - i
        if (maxCellValue > maxPossibleSeen) maxPossibleSeen = maxCellValue
      } else {
        cellsStatus.push(0)
        if (minOffset > 0) minOffset -= 1
        if (maxCellValue > maxPossibleSeen) maxPossibleSeen = maxCellValue
      }
    }

    const guaranteedSeenCells = cellsStatus.filter((status) => status === 1)
    if (guaranteedSeenCells.length > this.value) {
      logicStepDesc?.push(
        `${this.specificName} must see all of ${board.compactName(guaranteedSeenCells)}, which is more than are allowed. Board is invalid!`
      )
      return ConstraintResult.INVALID
    }

    const maybeSeenCells = this.cells.filter((_, i) => cellsStatus[i] > -1)
    const totalMaybeSeenCount = cellsStatus.reduce((count, seenVal) => seenVal === -1 ? count : count + 1, 0)
    if (totalMaybeSeenCount < this.value) {
      logicStepDesc?.push(
        `${this.specificName} only has ${totalMaybeSeenCount} cells that could be seen. Board is invalid!`
      )
      return ConstraintResult.INVALID
    }

    if (totalMaybeSeenCount === this.value) {
      // all maybe cells are forced,

      let loopAgain: boolean
      do {
        loopAgain = false
        for (let i = 0; i < maybeSeenCells.length; i += 1) {
          const previousMin = i > 0 ? minValue(board.cells[maybeSeenCells[i - 1]] & this.allValues) : 0
          const nextMax = i < maybeSeenCells.length - 1 ? maxValue(board.cells[maybeSeenCells[i + 1]] & this.allValues) : board.size + 1
          const newMask = this.maskBetweenExclusive(previousMin, nextMax)

          const result = board.keepCellMask(maybeSeenCells[i], newMask)
          if (result === ConstraintResult.UNCHANGED) continue
          if (result === ConstraintResult.INVALID) {
            logicStepDesc?.push(
              `${this.specificName} must see all of ${board.compactName(maybeSeenCells)}, so these cells must strictly increase from the clue, which leaves ${cellName(maybeSeenCells[i], board.size)} with no candidates. Board is invalid!`
            )
            return ConstraintResult.INVALID
          }

          changed = true
          loopAgain = true
        }
      } while (loopAgain)
      if (changed) {
        logicStepDesc?.push(
          `${this.specificName} must see all of ${board.compactName(maybeSeenCells)}, so these cells must strictly increase from the clue`,
        )
        return ConstraintResult.CHANGED
      }
    }

    // check to see if any maximums can be reduced by knowing what cells can/cannot be seen
    let lastSeen = 0
    let maybeSeenCount = 0
    for (let i = 0; i < this.cells.length; i += 1) {
      if (cellsStatus[i] === -1) continue
      maybeSeenCount += 1
      const maxValidValue = board.size - (this.value - maybeSeenCount)

      if (maxValue(board.cells[this.cells[i]]) > maxValidValue) {
        const result = board.clearCellMask(this.cells[i], this.maskStrictlyHigher(maxValidValue))
        if (result !== ConstraintResult.UNCHANGED) {
          logicStepDesc?.push(
            `${cellName(this.cells[i], board.size)} cannot be higher than ${maxValidValue} for ${this.specificName} to be valid`
          )

          if (result === ConstraintResult.INVALID) {
            logicStepDesc?.push(' which leaves it with no candidates. Board is invalid!')
            return ConstraintResult.INVALID
          }

          return ConstraintResult.CHANGED
        }
      }
    }

    let minLastSeen = board.size + 1
    let lastSeenCell = 0
    const forcedSeen: number[] = []
    for (let i = this.cells.length - 1; i >= 0; i -= 1) {
      if (cellsStatus[i] === -1) continue
      if (cellsStatus[i] === 1) {
        minLastSeen = minValue(board.cells[this.cells[i]] & this.allValues)
        lastSeenCell = this.cells[i]
      } else {
        if (minLastSeen > board.size) continue
        const minRemainingToBeSeen = this.value - (board.size - minLastSeen + 1)
        const remainingStatuses = cellsStatus.slice(0, i + 1)

        const mustBeFilled = remainingStatuses.filter((status) => status === 1)
        const mayBeFilled = remainingStatuses.filter((status) => status >= 0)

        if (minRemainingToBeSeen > mayBeFilled.length) {
          // we need more cells than we can fit
          logicStepDesc?.push(
            `${this.specificName} needs at least ${minRemainingToBeSeen} cells to be seen before ${cellName(lastSeenCell, board.size)}, but there aren't enough cells remaining. Board is invalid!`
          )
          return ConstraintResult.INVALID
        }

        if (minRemainingToBeSeen === mustBeFilled.length) {
          // other remaining cells must not be seen
          let maxLastSeen = 0
          for (let cellIndex = 0; this.cells[cellIndex] !== lastSeenCell; cellIndex += 1) {
            if (cellsStatus[cellIndex] === -1) continue
            if (cellsStatus[cellIndex] === 1) {
              maxLastSeen = maxValue(board.cells[this.cells[cellIndex]] & this.allValues)
            } else {
              // cell must be lower than max
              const result = board.clearCellMask(this.cells[cellIndex], this.maskHigherOrEqual(maxLastSeen))
              if (result === ConstraintResult.UNCHANGED) continue
              
              logicStepDesc?.push(
                `${cellName(this.cells[cellIndex], board.size)} must not be seen by ${this.specificName}, so it must be smaller than ${maxLastSeen}`
              )
              if (result === ConstraintResult.CHANGED) return ConstraintResult.CHANGED

              logicStepDesc?.push(' which leaves it with no candidates. Board is invalid!')
              return ConstraintResult.INVALID
            }
          }
        }


        if (minRemainingToBeSeen === mayBeFilled.length) {
          // remaining cells must be seen
          forcedSeen.push(
            ...cellsStatus.slice(0, i + 1).reduce((cells, status, i) => status >= 0 ? [...cells, this.cells[i]] : cells, [] as number[])
          )
          break
        }

        minLastSeen = maxValue(board.cells[this.cells[i]] & this.allValues)
      }
    }
    if (forcedSeen.length) {
      let loopAgain: boolean
      do {
        loopAgain = false
        for (let i = 0; i < forcedSeen.length; i += 1) {
          const previousMin = i > 0 ? minValue(board.cells[forcedSeen[i - 1]] & this.allValues) : 0
          const nextMax = i < forcedSeen.length - 1 ? maxValue(board.cells[forcedSeen[i + 1]] & this.allValues) : board.size + 1
          const newMask = this.maskBetweenExclusive(previousMin, nextMax)

          const result = board.keepCellMask(forcedSeen[i], newMask)
          if (result === ConstraintResult.UNCHANGED) continue
          if (result === ConstraintResult.INVALID) {
            logicStepDesc?.push(
              `${this.specificName} must see all of ${board.compactName(forcedSeen)}, so these cells must strictly increase from the clue, which leaves ${cellName(forcedSeen[i], board.size)} with no candidates. Board is invalid!`
            )
            return ConstraintResult.INVALID
          }

          changed = true
          loopAgain = true
        }
      } while (loopAgain)
      if (changed) {
        logicStepDesc?.push(
          `${this.specificName} must see all of ${board.compactName(forcedSeen)}, so these cells must strictly increase from the clue`,
        )
        return ConstraintResult.CHANGED
      }
    }

    return ConstraintResult.UNCHANGED
  }

  private currentCount(board: Board) {
    let lastSeen = 0
    let count = 0
    for (let cell of this.cells) {
      if (board.isGiven(cell)) {
        const cellValue = board.getValue(cell)

        if (cellValue > lastSeen) {
          lastSeen = cellValue
          count += 1
        }
      }
    }
    return count
  }
}

export function register() {
  registerConstraint(
    'skyscraper',
    (board, params, definition) => {
      const value = definition?.value ? definition.value(params) : params.value
      if (!Number.isFinite(value)) return []

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

      return new SkyscraperConstraint(
        board,
        { cells, value },
      )
    }
  )
}