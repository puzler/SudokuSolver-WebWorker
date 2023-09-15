import type Board from '../board'
import Constraint, { ConstraintResult } from './constraint'
import { registerConstraint } from '../constraint-builder'
import { cellName, maskToString, maxValue, minValue, popcount } from '../solve-utility'
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
    
    if (isRepeat) return ConstraintResult.UNCHANGED

    board.addNonRepeatWeakLinks(this.bulb1, this.bulb2)
    const lineMask = this.maskBetweenExclusive(1, board.size)
    for (let cell of this.lineCells) {
      board.addNonRepeatWeakLinks(this.bulb1, cell)
      board.addNonRepeatWeakLinks(this.bulb2, cell)
      if (board.keepCellMask(cell, lineMask) === ConstraintResult.INVALID) return ConstraintResult.INVALID
    }

    const bulbFreedom = board.size - (this.minUniqueLineValues + 1)
    if (bulbFreedom < Math.ceil(board.size / 2)) {
      const bulbMask = this.maskLowerOrEqual(bulbFreedom) | this.maskStrictlyHigher(board.size - bulbFreedom)
      if (board.keepCellMask(this.bulb1, bulbMask) === ConstraintResult.INVALID) return ConstraintResult.INVALID
      if (board.keepCellMask(this.bulb2, bulbMask) === ConstraintResult.INVALID) return ConstraintResult.INVALID
    }

    return ConstraintResult.CHANGED
  }

  enforce(board: Board, cellIndex: number, value: number) {
    if (this.lineCells.includes(cellIndex)) {
      const bulb1Given = board.isGiven(this.bulb1)
      const bulb2Given = board.isGiven(this.bulb2)

      if (bulb1Given && bulb2Given) {
        const bulbValues = [
          board.getValue(this.bulb1),
          board.getValue(this.bulb2),
        ].sort((a, b) => a - b)
        return value > bulbValues[0] && value < bulbValues[1]
      }

      if (bulb1Given) {
        const bulbValue = board.getValue(this.bulb1)
        if (value === bulbValue) return false
        if (value < bulbValue) return value > minValue(board.cells[this.bulb2])
        return value < maxValue(board.cells[this.bulb2])
      }

      if (bulb2Given) {
        const bulbValue = board.getValue(this.bulb2)
        if (value === bulbValue) return false
        if (value < bulbValue) return value > minValue(board.cells[this.bulb1])
        return value < maxValue(board.cells[this.bulb1])
      }

      const bulb1Min = minValue(board.cells[this.bulb1])
      const bulb2Max = maxValue(board.cells[this.bulb2])
      if (bulb1Min < value && value < bulb2Max) return true

      const bulb2Min = minValue(board.cells[this.bulb2])
      const bulb1Max = maxValue(board.cells[this.bulb1])
      return bulb2Min < value && value < bulb1Max
    } else if (cellIndex === this.bulb1 || cellIndex === this.bulb2) {
      const otherBulb = cellIndex === this.bulb1 ? this.bulb2 : this.bulb1
      if (board.isGiven(otherBulb)) {
        const bulbValues = [
          board.getValue(otherBulb),
          value
        ].sort((a, b) => a - b)
        const validLine = this.maskBetweenExclusive(bulbValues[0], bulbValues[1])
        for (let cell of this.lineCells) {
          if ((board.cells[cell] & validLine) === 0) return false
        }
        return true
      } else {
        const otherBulbMin = minValue(board.cells[otherBulb] & this.allValues)
        const otherBulbMax = maxValue(board.cells[otherBulb] & this.allValues)
        let otherBulbHigher = value < otherBulbMax
        let otherBulbLower = value > otherBulbMin
        if (!otherBulbHigher && !otherBulbLower) return false

        if (value - this.minUniqueLineValues <= otherBulbMin) otherBulbLower = false
        if (value + this.minUniqueLineValues >= otherBulbMax) otherBulbHigher = false
        if (!otherBulbHigher && !otherBulbLower) return false
  
        for (let cell of this.lineCells) {
          const cellMin = minValue(board.cells[cell] & this.allValues)
          const cellMax = maxValue(board.cells[cell] & this.allValues)
          if (cellMax < value) otherBulbHigher = false
          if (cellMin > value) otherBulbLower = false
          if (otherBulbMax < cellMin) otherBulbHigher = false
          if (otherBulbMin > cellMax) otherBulbLower = false
        }
        if (!otherBulbHigher && !otherBulbLower) return false

        return true
      }
    }

    return true
  }

  logicStep(board: Board, logicStepDesc: null|string[]) {
    const bulb1Given = board.isGiven(this.bulb1)
    const bulb2Given = board.isGiven(this.bulb2)

    // if both bulbs are given, just make sure that everything on the line is valid
    if (bulb1Given && bulb2Given) {
      const bulbValues = [board.getValue(this.bulb1), board.getValue(this.bulb2)]
      const mask = this.maskBetweenExclusive(Math.min(...bulbValues), Math.max(...bulbValues))
      let changed = false
      for (let cell of this.lineCells) {
        const result = board.keepCellMask(cell, mask)
        if (result === ConstraintResult.UNCHANGED) continue
        
        if (!changed) {
          logicStepDesc?.push(
            `Cells along ${this.specificName} must be between the bulb values of ${Math.min(...bulbValues)} and ${Math.max(...bulbValues)}`
          )
          changed = true
        }

        if (result === ConstraintResult.INVALID) {
          logicStepDesc?.push(` which leaves ${cellName(cell, board.size)} with no candidates. Board is invalid!`)
          return ConstraintResult.INVALID
        }
      }

      return changed ? ConstraintResult.CHANGED : ConstraintResult.UNCHANGED
    }

    const { min, max } = this.givenLineCellsMinMax(board)
    if (max >= board.size || min <= 1) {
      logicStepDesc?.push(`${this.specificName} has illegal values along the line. Board is invalid!`)
      return ConstraintResult.INVALID
    }

    if (bulb1Given || bulb2Given) {
      const givenBulb = bulb1Given ? this.bulb1 : this.bulb2
      const otherBulb = bulb1Given ? this.bulb2 : this.bulb1
      const givenVal = board.getValue(givenBulb)

      let knownCanBeLower = givenVal + this.minUniqueLineValues < board.size
      let knownCanBeHigher = givenVal - this.minUniqueLineValues > 1

      if (!knownCanBeHigher && !knownCanBeLower) {
        logicStepDesc?.push(`${this.specificName} has ${givenVal} on a bulb, which makes the line impossible. Board is invalid!`)
        return ConstraintResult.INVALID
      }

      if (max >= min) {
        // we know at least one cell on the line, and one bulb. So we know which bulb is high/low
        if (givenVal < min) {
          if (!knownCanBeLower) {
            logicStepDesc?.push(`${cellName(givenBulb, board.size)} must be the lower bulb along ${this.specificName}, but there's not enough unique values to fill the rest of the line. Board is invalid!`)
            return ConstraintResult.INVALID
          }

          knownCanBeHigher = false
        } else if (givenVal > max) {
          if (!knownCanBeHigher) {
            logicStepDesc?.push(`${cellName(givenBulb, board.size)} must be the higher bulb along ${this.specificName}, but there's not enough unique values to fill the rest of the line. Board is invalid!`)
            return ConstraintResult.INVALID
          }

          knownCanBeLower = false
        } else {
          logicStepDesc?.push(`${cellName(givenBulb, board.size)} is between ${min} and ${max} which are known values on the line. Board is invalid!`)
          return ConstraintResult.INVALID
        }
      }

      const minOtherBulbValue = minValue(board.cells[otherBulb] & this.allValues)
      const maxOtherBulbValue = maxValue(board.cells[otherBulb] & this.allValues)

      for (let cell of this.lineCells) {
        const maxLineCellValue = maxValue(board.cells[cell] & this.allValues)
        const minLineCellValue = minValue(board.cells[cell] & this.allValues)

        if (minLineCellValue > givenVal) {
          if (!knownCanBeLower) {
            logicStepDesc?.push(`${cellName(cell, board.size)} must be higher than ${cellName(givenBulb, board.size)}, but that bulb cannot be the lower bulb of ${this.specificName}. Board is invalid!`)
            return ConstraintResult.INVALID
          }
          knownCanBeHigher = false
        }

        if (maxLineCellValue < givenVal) {
          if (!knownCanBeHigher) {
            logicStepDesc?.push(`${cellName(cell, board.size)} must be lower than ${cellName(givenBulb, board.size)}, but that bulb cannot be the higher bulb of ${this.specificName}. Board is invalid!`)
            return ConstraintResult.INVALID
          }
          knownCanBeLower = false
        }

        if (maxLineCellValue < minOtherBulbValue) {
          if (!knownCanBeLower) {
            logicStepDesc?.push(
              `${cellName(otherBulb, board.size)} must be higher than ${cellName(cell, board.size)}, but the bulb at ${cellName(givenBulb, board.size)} cannot be the lower bulb of ${this.specificName}. Board is invalid!`
            )
            return ConstraintResult.INVALID
          }
          knownCanBeHigher = false
        }

        if (minLineCellValue > maxOtherBulbValue) {
          if (!knownCanBeHigher) {
            logicStepDesc?.push(
              `${cellName(otherBulb, board.size)} must be lower than ${cellName(cell, board.size)}, but the bulb at ${cellName(givenBulb, board.size)} cannot be the higher bulb of ${this.specificName}. Board is invalid!`
            )
            return ConstraintResult.INVALID
          }
        }
      }

      let otherBulbMask = 0
      if (knownCanBeHigher) otherBulbMask |= this.maskStrictlyLower(Math.min(min, givenVal - this.minUniqueLineValues))
      if (knownCanBeLower) otherBulbMask |= this.maskStrictlyHigher(Math.max(max, givenVal + this.minUniqueLineValues))

      if (otherBulbMask === 0) {
        logicStepDesc?.push(`${cellName(otherBulb, board.size)} has no values that can satisfy ${this.specificName}. Board is invalid!`)
        return ConstraintResult.INVALID
      }

      const otherBulbClearMask = board.cells[otherBulb] & ~otherBulbMask
      if (otherBulbClearMask !== 0) {
        const result = board.clearCellMask(otherBulb, otherBulbClearMask)
        if (result !== ConstraintResult.UNCHANGED) {
          logicStepDesc?.push(
            `${cellName(otherBulb, board.size)} cannot be ${maskToString(otherBulbClearMask, board.size)}`
          )
          if (result === ConstraintResult.CHANGED) return ConstraintResult.CHANGED
  
          logicStepDesc?.push(' which leaves it with no candidates. Board is invalid!')
          return ConstraintResult.INVALID
        }
      }

      let lineCellMask = 0
      if (knownCanBeHigher) lineCellMask |= this.maskBetweenExclusive(minValue(board.cells[otherBulb]), givenVal)
      if (knownCanBeLower) lineCellMask |= this.maskBetweenExclusive(givenVal, maxValue(board.cells[otherBulb]))
      if (lineCellMask === 0) {
        logicStepDesc?.push(`${this.specificName} has no values that can be placed along the line. Board is invalid!`)
        return ConstraintResult.INVALID
      }

      let changed = false
      for (let cell of this.lineCells) {
        const result = board.keepCellMask(cell, lineCellMask)
        if (result === ConstraintResult.UNCHANGED) continue
        if (!changed) {
          logicStepDesc?.push(`Cells along ${this.specificName} may only contain ${maskToString(lineCellMask, board.size)}`)
          changed = true
        }
        if (result === ConstraintResult.INVALID) {
          logicStepDesc?.push(` which leaves ${cellName(cell, board.size)} with no candidates. Board is invalid!`)
          return ConstraintResult.INVALID
        }
      }
      if (changed) return ConstraintResult.CHANGED
    } else {
      const bulb1Min = minValue(board.cells[this.bulb1] & this.allValues)
      const bulb1Max = maxValue(board.cells[this.bulb1] & this.allValues)
      const bulb2Min = minValue(board.cells[this.bulb2] & this.allValues)
      const bulb2Max = maxValue(board.cells[this.bulb2] & this.allValues)

      let bulb1CanBeLower = bulb1Min + this.minUniqueLineValues < board.size
      let bulb2CanBeLower = bulb2Min + this.minUniqueLineValues < board.size
      let bulb1CanBeHigher = bulb1Max - this.minUniqueLineValues > 1
      let bulb2CanBeHigher = bulb2Max - this.minUniqueLineValues > 1


      if (bulb1Max - this.minUniqueLineValues < bulb2Min) {
        bulb1CanBeHigher = false
        bulb2CanBeLower = false
      }

      if (bulb2Max - this.minUniqueLineValues < bulb1Min) {
        bulb1CanBeLower = false
        bulb2CanBeHigher = false
      }

      if (bulb1Min + this.minUniqueLineValues > bulb2Max) {
        bulb1CanBeLower = false
        bulb2CanBeHigher = false
      }

      if (bulb2Min + this.minUniqueLineValues > bulb1Max) {
        bulb2CanBeLower = false
        bulb1CanBeHigher = false
      }

      if (bulb1Min >= bulb2Max) {
        bulb1CanBeLower = false
        bulb2CanBeHigher = false
      }

      if (bulb2Min >= bulb1Max) {
        bulb1CanBeHigher = false
        bulb2CanBeLower = false
      }

      if (max >= min) {
        if (max < bulb1Min) bulb1CanBeLower = false
        if (max < bulb2Min) bulb2CanBeLower = false
        if (min > bulb1Max) bulb1CanBeHigher = false
        if (min > bulb2Max) bulb2CanBeHigher = false
      }

      for (let cell of this.lineCells) {
        const minLineCellValue = minValue(board.cells[cell] & this.allValues)
        const maxLineCellValue = maxValue(board.cells[cell] & this.allValues)
        if (minLineCellValue > bulb1Max) bulb1CanBeHigher = false
        if (minLineCellValue > bulb2Max) bulb2CanBeHigher = false
        if (maxLineCellValue < bulb1Min) bulb1CanBeLower = false
        if (maxLineCellValue < bulb2Min) bulb2CanBeLower = false
      }

      if (!bulb1CanBeHigher && !bulb2CanBeHigher) {
        logicStepDesc?.push(`Neither bulb of ${this.specificName} can be the higher bulb. Board is invalid!`)
        return ConstraintResult.INVALID
      } else if (!bulb1CanBeLower && !bulb2CanBeLower) {
        logicStepDesc?.push(`Neither bulb of ${this.specificName} can be the lower bulb. Board is invalid!`)
        return ConstraintResult.INVALID
      } else if (!bulb1CanBeLower && !bulb1CanBeHigher) {
        logicStepDesc?.push(`${cellName(this.bulb1, board.size)} cannot be the higher or lower bulb for ${this.specificName}. Board is invalid!`)
        return ConstraintResult.INVALID
      } else if (!bulb2CanBeLower && !bulb2CanBeHigher) {
        logicStepDesc?.push(`${cellName(this.bulb2, board.size)} cannot be the higher or lower bulb for ${this.specificName}. Board is invalid!`)
        return ConstraintResult.INVALID
      }

      let changed = false
      let bulb1Mask = 0
      if (bulb1CanBeHigher) bulb1Mask |= this.maskStrictlyHigher(Math.max(max, bulb2Min + this.minUniqueLineValues))
      if (bulb1CanBeLower) bulb1Mask |= this.maskStrictlyLower(Math.min(min, bulb2Max - this.minUniqueLineValues))
      const bulb1Result = board.keepCellMask(this.bulb1, bulb1Mask)
      if (bulb1Result === ConstraintResult.INVALID) {
        logicStepDesc?.push(`${cellName(this.bulb1, board.size)} can only be ${maskToString(bulb1Mask, board.size)}, which leaves it with no candidates. Board is invalid!`)
        return ConstraintResult.INVALID
      } else if (bulb1Result === ConstraintResult.CHANGED) changed = true

      let bulb2Mask = 0
      if (bulb2CanBeHigher) bulb2Mask |= this.maskStrictlyHigher(Math.max(max, bulb1Min + this.minUniqueLineValues))
      if (bulb2CanBeLower) bulb2Mask |= this.maskStrictlyLower(Math.min(min, bulb1Max - this.minUniqueLineValues))
      const bulb2Result = board.keepCellMask(this.bulb2, bulb2Mask)
      if (bulb2Result === ConstraintResult.INVALID) {
        logicStepDesc?.push(`${cellName(this.bulb2, board.size)} can only be ${maskToString(bulb2Mask, board.size)}, which leaves it with no candidates. Board is invalid!`)
        return ConstraintResult.INVALID
      } else if (bulb2Result === ConstraintResult.CHANGED) changed = true

      if (changed) {
        logicStepDesc?.push(`Reduced bulb cell values of ${this.specificName}`)
        return ConstraintResult.CHANGED
      }

      let lineCellMask = 0
      if (bulb1CanBeHigher && bulb2CanBeLower) lineCellMask |= this.maskBetweenExclusive(bulb2Min, bulb1Max)
      if (bulb1CanBeLower && bulb2CanBeHigher) lineCellMask |= this.maskBetweenExclusive(bulb1Min, bulb2Max)

      for (let cell of this.lineCells) {
        const result = board.keepCellMask(cell, lineCellMask)
        if (result === ConstraintResult.UNCHANGED) continue

        if (!changed) {
          changed = true
          logicStepDesc?.push(`Cells along ${this.specificName} must be from ${maskToString(lineCellMask, board.size)}`)
        }
        if (result === ConstraintResult.CHANGED) continue

        logicStepDesc?.push(` which leaves ${cellName(cell, board.size)} with no candidates. Board is invalid!`)
        return ConstraintResult.INVALID
      }
      if (changed) return ConstraintResult.CHANGED
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
