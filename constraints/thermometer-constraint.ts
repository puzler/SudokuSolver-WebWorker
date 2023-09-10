import type Board from '../board'
import Constraint, { ConstraintResult } from './constraint'
import { registerConstraint } from '../constraint-builder'
import { cellIndexFromAddress } from '../solve-worker'
import { cellName, hasValue, maskToString, valueBit } from '../solve-utility'

export default class ThermometerConstraint extends Constraint {
  constructor(constraintName: string, board: Board, params: { cells: any[], minDifference: number }) {
    const cells = params.cells.map(cellAddress => cellIndexFromAddress(cellAddress, board.size))
    const specificName = `${constraintName} from ${cellName(cells[0], board.size)} to ${cellName(cells[cells.length - 1], board.size)}`
    super(board, constraintName, specificName)

    this.cells = cells
    this.minDifference = params.minDifference
  }

  cells: number[]
  minDifference: number

  init(board: Board, isRepeat: boolean) {
    if (isRepeat) return ConstraintResult.UNCHANGED
    let changed = false

    if (this.minDifference > 0) {
      const valsPerCell = board.size - (this.minDifference * this.cells.length) + 1
      const results = this.cells.map(
        (cell, i) => board.keepCellMask(
          cell,
          this.maskBetweenInclusive(
            1 + (i * this.minDifference),
            valsPerCell + (i * this.minDifference),
          ),
        ),
      )

      if (results.some((res) => res === ConstraintResult.INVALID)) return ConstraintResult.INVALID
      if (results.some((res) => res === ConstraintResult.CHANGED)) changed = true
    }

    for (let highCellIndex = 1; highCellIndex < this.cells.length; highCellIndex += 1) {
      const lowCell = this.cells[highCellIndex - 1]
      const highCell = this.cells[highCellIndex]

      for (let lowVal = 1; lowVal <= board.size; lowVal += 1) {
        if (!hasValue(board.cells[lowCell], lowVal)) continue
        const lowCellCandidate = board.candidateIndex(lowCell, lowVal)

        for (let highVal = 1; highVal <= board.size; highVal += 1) {
          if (!hasValue(board.cells[highCell], highVal)) continue
          const highCellCandidate = board.candidateIndex(highCell, highVal)

          if (board.isWeakLink(lowCellCandidate, highCellCandidate)) continue
          if (highVal - lowVal >= this.minDifference) continue

          board.addWeakLink(lowCellCandidate, highCellCandidate)
          changed = true
        }
      }
    }

    return changed ? ConstraintResult.CHANGED : ConstraintResult.UNCHANGED
  }

  logicStep(board: Board, logicStepDesc: null|string[]) {
    let changed = false

    let lastPassChanged: boolean
    do {
      lastPassChanged = false
      for (let higherCellIndex = 1; higherCellIndex < this.cells.length; higherCellIndex += 1) {
        const lowCell = this.cells[higherCellIndex - 1]
        const highCell = this.cells[higherCellIndex]
  
        const results = this.compareCells(board, lowCell, highCell)
        if (results.some(res => res === ConstraintResult.INVALID)) {
          logicStepDesc?.push(`${this.specificName} is invalid!`)
          return ConstraintResult.INVALID
        }

        if (results.some(res => res === ConstraintResult.CHANGED)) {
          changed = true
          lastPassChanged = true
        }
      }
    } while (lastPassChanged)

    if (!changed) return ConstraintResult.UNCHANGED

    logicStepDesc?.push(`Reduced candidates for ${this.specificName}`)
    return ConstraintResult.CHANGED
  }

  private compareCells(board: Board, lowCell: number, highCell: number): (0|1|2)[] {
    let lowerCellMask = board.givenBit
    let higherCellMask = board.givenBit

    for (let lowVal = 1; lowVal <= board.size; lowVal += 1) {
      if (!hasValue(board.cells[lowCell], lowVal)) continue
      const lowCellCandidate = board.candidateIndex(lowCell, lowVal)

      for (let highVal = 1; highVal <= board.size; highVal += 1) {
        if (!hasValue(board.cells[highCell], highVal)) continue
        const highCellCandidate = board.candidateIndex(highCell, highVal)

        if (board.isWeakLink(lowCellCandidate, highCellCandidate)) continue
        if (highVal - lowVal < this.minDifference) continue

        lowerCellMask |= valueBit(lowVal)
        higherCellMask |= valueBit(highVal)
      }
    }

    return [
      board.keepCellMask(lowCell, lowerCellMask),
      board.keepCellMask(highCell, higherCellMask),
    ]
  }
}

export function register() {
  registerConstraint(
    'thermometer',
    (board, params, definition) => {
      const lines: any[][] = definition?.lines ? definition.lines(params) : params.lines
      return lines.reduce(
        (constraints, cells) => {
          if (cells.length < 2) return constraints
          return [
            ...constraints,
            new ThermometerConstraint(
              'Thermometer',
              board,
              { cells, minDifference: 1 },
            ),
          ]
        },
        [] as ThermometerConstraint[],
      )
    },
  )

  registerConstraint(
    'slowthermometer',
    (board, params, definition) => {
      const lines: any[][] = definition?.lines ? definition.lines(params) : params.lines
      return lines.reduce(
        (constraints, cells) => {
          if (cells.length < 2) return constraints
          return [
            ...constraints,
            new ThermometerConstraint(
              'Slow Thermometer',
              board,
              { cells, minDifference: 0 },
            )
          ]
        },
        [] as ThermometerConstraint[],
      )
    }
  )

  registerConstraint(
    'fastthermometer',
    (board, params, definition) => {
      const lines: any[][] = definition?.lines ? definition.lines(params) : params.lines
      return lines.reduce(
        (constraints, cells) => {
          if (cells.length < 2) return constraints
          return [
            ...constraints,
            new ThermometerConstraint(
              'Slow Thermometer',
              board,
              { cells, minDifference: 2 },
            )
          ]
        },
        [] as ThermometerConstraint[],
      )
    }
  )
}
