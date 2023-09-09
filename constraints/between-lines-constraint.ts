import type Board from '../board'
import Constraint, { ConstraintResult } from './constraint'
import { registerConstraint } from '../constraint-builder'
import { cellName, hasValue, maskToString, maxValue, minValue, valueBit, valuesList } from '../solve-utility'
import { cellIndexFromAddress } from '../solve-worker'

export default class BetweenLinesConstraint extends Constraint {
  constructor(board: Board, params: { lineCells: any[], bulbCells: any[] }) {
    const bulbCell1 = cellIndexFromAddress(params.bulbCells[0], board.size)
    const bulbCell2 = cellIndexFromAddress(params.bulbCells[1], board.size)

    super(
      board,
      'Between Line',
      `Between Line at ${cellName(bulbCell1, board.size)}-${cellName(bulbCell2, board.size)}`,
    )

    this.bulb1 = bulbCell1
    this.bulb2 = bulbCell2
    this.lineCells = params.lineCells.map(
      (cellAddress) => cellIndexFromAddress(cellAddress, board.size)
    ).sort((a, b) => a - b)
    this.lineCellsSet = new Set(this.lineCells)
    this.minUniqueLineValues = board.splitIntoGroups(this.lineCells)[0].length
  }

  bulb1: number
  bulb2: number
  lineCells: number[]
  lineCellsSet: Set<number>
  minUniqueLineValues: number

  private getMinUniqueValues(board: Board) {
    return board.splitIntoGroups(this.lineCells)[0].length
  }

  init(board: Board, isRepeat: boolean) {
    this.minUniqueLineValues = this.getMinUniqueValues(board)
    return this.doLogic(board, null)
  }

  logicStep(board: Board, logicStepDescription: null|string[]) {
    return this.doLogic(board, logicStepDescription)
  }

  private doLogic(board: Board, logicStepDescription: null|string[]): 0|1|2 {
    const bulb1Mask = board.cells[this.bulb1] & ~board.givenBit
    const bulb2Mask = board.cells[this.bulb2] & ~board.givenBit
    
    const bulb1Set = board.isGiven(this.bulb1)
    const bulb2Set = board.isGiven(this.bulb2)
    
    const bulb1HigherMask = this.maskBetweenExclusive(minValue(bulb2Mask), maxValue(bulb1Mask))
    const bulb2HigherMask = this.maskBetweenExclusive(minValue(bulb1Mask), maxValue(bulb2Mask))
    let lineClearMask = this.allValues & ~(bulb1HigherMask | bulb2HigherMask)

    const oldMask = this.lineCells.reduce((mask, cell) => mask | board.cells[cell], 0)
    const results = this.lineCells.map(
      (cell) => board.clearCellMask(cell, lineClearMask)
    )

    const invalidIndex = results.findIndex((res) => res === ConstraintResult.INVALID)
    if (invalidIndex >= 0) {
      logicStepDescription?.push(`${cellName(this.lineCells[invalidIndex], board.size)} cannot be between the bulb values.`)
      return ConstraintResult.INVALID
    }

    const changedCells = results.reduce(
      (cells, res, index) => res === ConstraintResult.CHANGED ? [...cells, this.lineCells[index]] : cells,
      [] as number[],
    )
    if (changedCells.length) {
      const cellNames = changedCells.map((cell) => cellName(cell, board.size)).join(', ')
      logicStepDescription?.push(
        `${this.specificName} cannot contain digits ${maskToString(lineClearMask & oldMask, board.size)} along the line. Removed candidates from ${cellNames}`
      )
      return ConstraintResult.CHANGED
    }

    if (bulb1Set && bulb2Set) return ConstraintResult.UNCHANGED

    if (bulb1Set || bulb2Set) {
      const setBulbValue = board.getValue(bulb1Set ? this.bulb1 : this.bulb2)
      const unsetBulb = bulb1Set ? this.bulb2 : this.bulb1

      const maxLowerValue = setBulbValue - this.minUniqueLineValues - 1
      const minUpperValue = setBulbValue + this.minUniqueLineValues + 1
      
      const lowerBulbValue = this.maskLowerOrEqual(maxLowerValue)
      const upperBulbValue = this.maskHigherOrEqual(minUpperValue)
      const { min, max } = this.givenLineCellsMinMax(board)

      let clearBulbMask: number
      if (max < min) {
        clearBulbMask = ~(lowerBulbValue | upperBulbValue)
      } else if (setBulbValue < min) {
        clearBulbMask = ~(upperBulbValue & this.maskStrictlyHigher(max))
      } else {
        clearBulbMask = ~(lowerBulbValue & this.maskStrictlyLower(min))
      }

      const oldMask = board.cells[unsetBulb]
      const result = board.clearCellMask(unsetBulb, clearBulbMask)
      if (logicStepDescription) {
        if (result === ConstraintResult.INVALID) {
          logicStepDescription.push(
            `Bulb at ${cellName(unsetBulb, board.size)} of ${this.specificName} has no valid candidates`,
          )
        } else if (result === ConstraintResult.CHANGED) {
          logicStepDescription.push(
            `Bulb at ${cellName(unsetBulb, board.size)} cannot have values ${maskToString(clearBulbMask & oldMask, board.size)}. Removing those candidates.`,
          )
        }
      }

      return result
    } else {
      const innerMask = this.lineCells.reduce(
        (mask, cell) => mask | board.cells[cell], 0
      ) & ~board.givenBit

      const minLineVal = minValue(innerMask)
      const maxLineVal = maxValue(innerMask)

      const minHigherBulbVal = maxLineVal - this.minUniqueLineValues
      const maxLowerBulbVal = minLineVal + this.minUniqueLineValues
      if (maxLowerBulbVal - minHigherBulbVal > 1) {
        const bulbClearMask = this.maskBetweenExclusive(minHigherBulbVal, maxLowerBulbVal)
        
        const oldMask = board.cells[this.bulb1] | board.cells[this.bulb2]
        const results = [
          board.clearCellMask(this.bulb1, bulbClearMask),
          board.clearCellMask(this.bulb2, bulbClearMask),
        ]
        
        if (results.some(res => res === ConstraintResult.INVALID)) {
          const invalidBulb = results[0] === ConstraintResult.INVALID ? this.bulb1 : this.bulb2
          logicStepDescription?.push(
            `All candidates in ${cellName(invalidBulb, board.size)} would break the cells along ${this.specificName}`
          )
          return ConstraintResult.INVALID
        }

        const changedBulbs = results.reduce(
          (bulbs, res, index) => res === ConstraintResult.CHANGED ? [...bulbs, index === 0 ? this.bulb1 : this.bulb2] : bulbs,
          [] as number[],
        )

        if (changedBulbs.length) {
          logicStepDescription?.push(`Candidates ${maskToString(bulbClearMask & oldMask, board.size)} in bulbs of ${this.specificName} would the cells along the line, so they are removed from ${changedBulbs.join(', ')}`)
          return ConstraintResult.CHANGED
        }
      }
    }

    return ConstraintResult.UNCHANGED
  }

  private givenLineCellsMinMax(board: Board) {
    return this.lineCells.reduce(
      ({ min, max }, cell) => {
        if (!board.isGiven(cell)) return { min, max }

        const value = board.getValue(cell)
        return {
          min: Math.min(min, value),
          max: Math.max(max, value),
        }
      },
      { min: Infinity, max: -Infinity },
    )
  }

}

export function register() {
  registerConstraint(
    'betweenline',
    (board, params, definition) => {
      const lines: any[][] = definition?.lines ? definition.lines(params) : params.lines
      return lines.reduce(
        (constraints, line) => {
          if (line.length < 3) return constraints

          const bulbCells = [line[0], line[line.length - 1]]
          if (bulbCells[0] === bulbCells[1]) return constraints

          return [
            ...constraints,
            new BetweenLinesConstraint(
              board,
              {
                bulbCells,
                lineCells: line.slice(1, line.length - 1),
              },
            ),
          ]
        },
        [] as BetweenLinesConstraint[]
      )
    }
  )
}
