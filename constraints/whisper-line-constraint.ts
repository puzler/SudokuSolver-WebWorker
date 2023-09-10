import type Board from '../board'
import Constraint, { ConstraintResult } from './constraint'
import { cellIndexFromAddress } from '../solve-worker'
import { cellName, hasValue, valueBit, valuesList } from '../solve-utility'
import { registerConstraint } from '../constraint-builder'

export default class WhisperLineConstraint extends Constraint {
  constructor(constraintName: string, board: Board, params: { cells: any[], difference: number }) {
    const cells = params.cells.map(cellAddress => cellIndexFromAddress(cellAddress, board.size))
    super(board, constraintName, `${constraintName} at ${cellName(cells[0], board.size)}`)

    this.cells = cells
    this.cellsSet = new Set(cells)
    this.difference = params.difference
  }

  cells: number[]
  cellsSet: Set<number>
  difference: number

  init(board: Board, isRepeat: boolean) {
    const results: (0|1|2)[] = []
    for (let cell2Index = 1; cell2Index < this.cells.length; cell2Index += 1) {
      const cell1 = this.cells[cell2Index - 1]
      const cell2 = this.cells[cell2Index]

      const cell1Values = Array.from({ length: board.size + 1}, () => false)
      const cell2Values = Array.from({ length: board.size + 1}, () => false)

      for(let value1 = 1; value1 <= board.size; value1 += 1) {
        if (!hasValue(board.cells[cell1], value1)) continue

        for (let value2 = 1; value2 <= board.size; value2 += 1) {
          if (!hasValue(board.cells[cell2], value2)) continue

          if (Math.abs(value1 - value2) >= this.difference) {
            cell1Values[value1] = true
            cell2Values[value2] = true
          } else {
            const cell1Candidate = board.candidateIndex(cell1, value1)
            const cell2Candidate = board.candidateIndex(cell2, value2)

            if (!board.isWeakLink(cell1Candidate, cell2Candidate)) {
              board.addWeakLink(cell1Candidate, cell2Candidate)
            }
          }
        }
      }

      const cell1Mask = cell1Values.reduce((mask, used, value) => (used ? mask | valueBit(value) : mask), 0)
      const cell2Mask = cell2Values.reduce((mask, used, value) => (used ? mask | valueBit(value) : mask), 0)

      results.push(
        board.keepCellMask(cell1, cell1Mask),
        board.keepCellMask(cell2, cell2Mask),
      )
    }

    return Math.max(...results) as 0|1|2
  }

  enforce(board: Board, cellIndex: number, value: number) {
    if (!this.cellsSet.has(cellIndex)) return true

    const lineIndex = this.cells.indexOf(cellIndex)
    if (lineIndex > 0) {
      const previousCell = this.cells[lineIndex - 1]
      const invalidNeighbor = valuesList(board.cells[previousCell]).every(
        (neighborVal) => Math.abs(neighborVal - value) < this.difference,
      )
      if (invalidNeighbor) return false
    }

    if (lineIndex < this.cells.length - 1) {
      const nextCell = this.cells[lineIndex + 1]
      const invalidNeighbor = valuesList(board.cells[nextCell]).every(
        (neighborVal) => Math.abs(neighborVal - value) < this.difference,
      )
      if (invalidNeighbor) return false
    }

    return true
  }

  logicStep(board: Board, logicalStepDescription: null|string[]) {
    const results: (0|1|2)[] = []

    for (let cell2Index = 1; cell2Index < this.cells.length; cell2Index += 1) {
      const cell1 = this.cells[cell2Index - 1]
      const cell2 = this.cells[cell2Index]

      const cell1Vals = Array.from({ length: board.size + 1 }, () => false)
      const cell2Vals = Array.from({ length: board.size + 1 }, () => false)

      for (let value1 of valuesList(board.cells[cell1])) {
        for (let value2 of valuesList(board.cells[cell2])) {
          if (Math.abs(value1 - value2) >= this.difference) {
            cell1Vals[value1] = true
            cell2Vals[value2] = true
          }
        }
      }

      const cell1Mask = cell1Vals.reduce((mask, used, value) => (used ? mask | valueBit(value) : mask), 0)
      const cell2Mask = cell2Vals.reduce((mask, used, value) => (used ? mask | valueBit(value) : mask), 0)

      results.push(
        board.keepCellMask(cell1, cell1Mask),
        board.keepCellMask(cell2, cell2Mask),
      )
    }

    if (results.length === 0) return ConstraintResult.UNCHANGED
    return Math.max(...results) as 0|1|2
  }
}

export function register() {
  registerConstraint(
    'germanwhispers',
    (board, params, definition) => {
      const lines = definition?.lines ? definition.lines(params) : params.lines
      return lines.map(
        (cells: any[]) => new WhisperLineConstraint(
          'German Whisper Line',
          board,
          { cells, difference: board.size - 4 },
        )
      )
    }
  )

  registerConstraint(
    'dutchwhispers',
    (board, params, definition) => {
      const lines = definition?.lines ? definition.lines(params) : params.lines
      return lines.map(
        (cells: any[]) => new WhisperLineConstraint(
          'Dutch Whisper Line',
          board,
          { cells, difference: board.size - 5 },
        )
      )
    }
  )
}
