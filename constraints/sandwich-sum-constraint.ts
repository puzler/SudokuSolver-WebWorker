import type Board from '../board'
import Constraint, { ConstraintResult } from './constraint'
import { registerConstraint } from '../constraint-builder'
import { cellIndexFromAddress } from '../solve-worker'
import SumGroup from '../sum-group'
import { cellName, hasValue, maskToString, maxValue, minValue, popcount, valueBit, valuesList } from '../solve-utility'
import SumCellsHelper from '../sum-cells-helper'

export default class SandwichSumConstraint extends Constraint {
  constructor(board: Board, params: { cells: any[], sum: number }) {
    const cells = params.cells.map(
      cellAddress => cellIndexFromAddress(cellAddress, board.size),
    ).sort((a, b) => a - b)
    const sumType = cells[cells.length - 1] - cells[0] < board.size ? 'Row' : 'Column'
    const sumTypeIndex = (sumType === 'Column' ? cells[0] : (cells[0] / board.size)) + 1
    super(board, 'Sandwich Sum', `Sandwich Sum for ${sumType} ${sumTypeIndex}`)

    this.cells = cells
    this.sum = params.sum
    this.sumGroups = []
    for (let sumSize = 1; sumSize < board.size - 2; sumSize += 1) {
      for (let firstCell = 1; firstCell < board.size - sumSize; firstCell += 1) {
        this.sumGroups.push(new SumGroup(
          board, this.cells.slice(firstCell, firstCell + sumSize),
          [this.lowerCrust, this.upperCrust],
        ))
      }
    }
  }

  cells: number[]
  sum: number
  sumGroups: SumGroup[]

  init(board: Board, isRepeat: boolean) {
    if (this.sum === 1) return ConstraintResult.INVALID
    if (this.sum > this.maxSum) return ConstraintResult.INVALID
    if (this.sum === this.maxSum - 1) return ConstraintResult.INVALID
    let changed = false

    if (this.sum === 0) {
      // crusts must go next to each other
      let canBeLowerCrust = 0
      let canBeUpperCrust = 0
      for (let i = 0; i < this.cells.length; i += 1) {
        if (hasValue(board.cells[this.cells[i]], this.lowerCrust)) canBeLowerCrust |= valueBit(i)
        if (hasValue(board.cells[this.cells[i]], this.upperCrust)) canBeUpperCrust |= valueBit(i)
      }

      let loopAgain: boolean
      do {
        loopAgain = false
        for (let i = 0; i < this.cells.length; i += 1) {
          const cell = this.cells[i]
          const neighbors = [i - 1, i + 1].filter((n) => n >= 0 && n < this.cells.length)
          
          // check if neighbor can be lower
          if (hasValue(canBeUpperCrust, i)) {
            const neighborCanBeLower = neighbors.some((index) => hasValue(canBeLowerCrust, index))
            if (!neighborCanBeLower) {
              const result = board.clearCellMask(cell, valueBit(this.upperCrust))
              if (result === ConstraintResult.INVALID) return ConstraintResult.INVALID
              if (result === ConstraintResult.CHANGED) {
                loopAgain = true
                changed = true
              }
              canBeUpperCrust ^= valueBit(i)
            } 
          }

          if (hasValue(canBeLowerCrust, i)) {
            const neighborCanBeHigher = neighbors.some((index) => hasValue(canBeUpperCrust, index))

            if (!neighborCanBeHigher) {
              const result = board.clearCellMask(cell, valueBit(this.lowerCrust))
              if (result === ConstraintResult.INVALID) return ConstraintResult.INVALID
              if (result === ConstraintResult.CHANGED) {
                loopAgain = true
                changed = true
              }
              canBeLowerCrust ^= valueBit(i)
            }
          }
        }
      } while (loopAgain)

      // check for single crust locations
      if (popcount(canBeUpperCrust) === 1) {
        const upperIndex = valuesList(canBeUpperCrust)[0]
        const upperCrustCell = this.cells[upperIndex]
        const result = board.keepCellMask(upperCrustCell, valueBit(this.upperCrust))
        if (result === ConstraintResult.INVALID) return ConstraintResult.INVALID
        if (result === ConstraintResult.CHANGED) {
          changed = true
          canBeLowerCrust ^= valueBit(upperIndex)
        }
      }

      if (popcount(canBeLowerCrust) === 1) {
        const lowerIndex = valuesList(canBeLowerCrust)[0]
        const lowerCrustCell = this.cells[lowerIndex]
        const result = board.keepCellMask(lowerCrustCell, valueBit(this.lowerCrust))
        if (result === ConstraintResult.INVALID) return ConstraintResult.INVALID
        if (result === ConstraintResult.CHANGED) {
          changed = true

          if (hasValue(canBeUpperCrust, lowerIndex)) {
            // check upper crust one more time since we can remove it
            canBeUpperCrust ^= valueBit(lowerIndex)

            if (popcount(canBeUpperCrust) === 1) {
              const upperIndex = valuesList(canBeUpperCrust)[0]
              const upperCrustCell = this.cells[upperIndex]
              const result = board.keepCellMask(upperCrustCell, valueBit(this.upperCrust))
              if (result === ConstraintResult.INVALID) return ConstraintResult.INVALID
              if (result === ConstraintResult.CHANGED) changed = true
            }
          }
        }
      }

      // check for no crust locations
      if (canBeUpperCrust === 0 || canBeLowerCrust === 0) return ConstraintResult.INVALID

      if (popcount(canBeUpperCrust) === 2 && popcount(canBeLowerCrust) === 2 && canBeUpperCrust === canBeLowerCrust) {
        // upper and lower crust are locked into two places
        const cells = valuesList(canBeUpperCrust).map((i) => this.cells[i])
        const results = cells.map(
          (cell) => board.keepCellMask(cell, valueBit(this.upperCrust) | valueBit(this.lowerCrust))
        )

        if (results.some((res) => res === ConstraintResult.INVALID)) return ConstraintResult.INVALID
        if (results.some((res) => res === ConstraintResult.CHANGED)) changed = true
      }

      return changed ? ConstraintResult.CHANGED : ConstraintResult.UNCHANGED
    } else {
      const validGroups = this.validGroups(board)
      const crustMask = valueBit(this.upperCrust) | valueBit(this.lowerCrust)

      if (validGroups.length === 0) return ConstraintResult.INVALID

      // Check to see if all valid groups share any crust cells
      const groupsCrusts = validGroups.map(
        (group) => [
          this.cells[this.cells.indexOf(Math.min(...group.cells)) - 1],
          this.cells[this.cells.indexOf(Math.max(...group.cells)) + 1],
        ],
      )

      const requiredCrustCells = groupsCrusts[0].filter(
        (crustCell) => groupsCrusts.every((crusts) => crusts.includes(crustCell)),
      ).sort((a, b) => a - b)

      if (requiredCrustCells.length > 0) {
        for (let cell of requiredCrustCells) {
          const result = board.keepCellMask(cell, crustMask)
          if (result === ConstraintResult.INVALID) return ConstraintResult.INVALID
          if (result === ConstraintResult.CHANGED) changed = true
        }

        if (requiredCrustCells.length === 2) {
          // both crust cells are known, so we can remove the crust values from seen cells
          const seenByFirst = board.seenCells(requiredCrustCells[0])
          const seenBySecond = board.seenCells(requiredCrustCells[1])
          const seenByBoth = seenByFirst.filter((cell) => seenBySecond.includes(cell))

          if (seenByBoth.length > 0) {
            for (let cell of seenByBoth) {
              const result = board.clearCellMask(cell, crustMask)
              if (result === ConstraintResult.INVALID) return ConstraintResult.INVALID
              if (result === ConstraintResult.CHANGED) changed = true
            }
          }

          // lastly, since all sum cells are known, we use sum cells helper for the rest
          const sumCells = this.cells.slice(this.cells.indexOf(requiredCrustCells[0]) + 1, this.cells.indexOf(requiredCrustCells[1]))
          const sumHelper = new SumCellsHelper(board, sumCells)
          return Math.max(
            sumHelper.init(board, [this.sum]),
            changed ? ConstraintResult.CHANGED : ConstraintResult.UNCHANGED,
          ) as 0|1|2
        }
      }

      const requiredSumCells = validGroups[0].cells.filter(
        (cell) => validGroups.every(({ cells }) => cells.includes(cell))
      )

      if (requiredSumCells.length > 0) {
        // cells are required for the sum, for now just remove crust candidates from them
        for (let cell of requiredSumCells) {
          const result = board.clearCellMask(cell, crustMask)
          if (result === ConstraintResult.INVALID) return ConstraintResult.INVALID
          if (result === ConstraintResult.CHANGED) changed = true
        }
      }
    }

    return changed ? ConstraintResult.CHANGED : ConstraintResult.UNCHANGED
  }

  logicStep(board: Board, logicStepDesc: null|string[]) {
    if (this.sum === 1) return ConstraintResult.INVALID
    if (this.sum > this.maxSum) return ConstraintResult.INVALID
    if (this.sum === this.maxSum - 1) return ConstraintResult.INVALID

    if (this.sum === 0) {
      // crusts must go next to each other
      for (let i = 0; i < this.cells.length; i += 1) {
        const cell = this.cells[i]
        const cellCanBeLower = hasValue(board.cells[cell], this.lowerCrust)
        const cellCanBeUpper = hasValue(board.cells[cell], this.upperCrust)
        if (!cellCanBeLower && !cellCanBeUpper) continue

        const neighbors = [i - 1, i + 1].filter((n) => n >= 0 && n < this.cells.length)
        if (cellCanBeUpper) {
          const lowerNeighbors = neighbors.filter((n) => hasValue(board.cells[this.cells[n]], this.lowerCrust))
          if (lowerNeighbors.length === 0) {
            const result = board.clearCellMask(cell, valueBit(this.upperCrust))
            if (result === ConstraintResult.INVALID) {
              logicStepDesc?.push(
                `${cellName(cell, board.size)} cannot contain ${this.upperCrust}, as none of its neighbors in ${this.specificName} can contain ${this.lowerCrust}, which leaves it with no candidates. Board is Invalid!`
              )
              return ConstraintResult.INVALID
            } else if (result === ConstraintResult.CHANGED) {
              logicStepDesc?.push(
                `${cellName(cell, board.size)} cannot contain ${this.upperCrust}, as none of its neighbors in ${this.specificName} can contain ${this.lowerCrust}`
              )
              return ConstraintResult.CHANGED
            }
          }

          // check for weak links that would prevent this cell from being high
          const upperCandidate = board.candidateIndex(cell, this.upperCrust)
          const neighborLowerCandidates = lowerNeighbors.map((n) => board.candidateIndex(this.cells[n], this.lowerCrust))
          if (neighborLowerCandidates.every((lowerCandidate) => board.isWeakLink(upperCandidate, lowerCandidate))) {
            // cell cannot be upper, because weak links would prevent neighbors from being lower
            const result = board.clearCellMask(cell, valueBit(this.upperCrust))
            if (result === ConstraintResult.INVALID) {
              logicStepDesc?.push(
                `${cellName(cell, board.size)} cannot contain ${this.upperCrust}, because that would remove ${this.lowerCrust} from its neighbors in ${this.specificName}, which leaves it with no candidates. Board is Invalid!`
              )
              return ConstraintResult.INVALID
            } else if (result === ConstraintResult.CHANGED) {
              logicStepDesc?.push(
                `${cellName(cell, board.size)} cannot contain ${this.upperCrust}, because that would remove ${this.lowerCrust} from its neighbors in ${this.specificName}`
              )
              return ConstraintResult.CHANGED
            }
          }
        }

        if (cellCanBeLower) {
          const upperNeighbors = neighbors.filter((n) => hasValue(board.cells[this.cells[n]], this.upperCrust))
          if (upperNeighbors.length === 0) {
            const result = board.clearCellMask(cell, valueBit(this.lowerCrust))
            if (result === ConstraintResult.INVALID) {
              logicStepDesc?.push(
                `${cellName(cell, board.size)} cannot contain ${this.lowerCrust}, as none of its neighbors in ${this.specificName} can contain ${this.upperCrust}, which leaves it with no candidates. Board is Invalid!`
              )
              return ConstraintResult.INVALID
            } else if (result === ConstraintResult.CHANGED) {
              logicStepDesc?.push(
                `${cellName(cell, board.size)} cannot contain ${this.lowerCrust}, as none of its neighbors in ${this.specificName} can contain ${this.upperCrust}`
              )
              return ConstraintResult.CHANGED
            }
          }

          // check for weak links that would prevent this cell from being low
          const lowerCandidate = board.candidateIndex(cell, this.lowerCrust)
          const neighborUpperCandidates = upperNeighbors.map((n) => board.candidateIndex(this.cells[n], this.upperCrust))
          if (neighborUpperCandidates.every((upperCandidate) => board.isWeakLink(upperCandidate, lowerCandidate))) {
            // cell cannot be lower, because weak links would prevent neighbors from being upper
            const result = board.clearCellMask(cell, valueBit(this.lowerCrust))
            if (result === ConstraintResult.INVALID) {
              logicStepDesc?.push(
                `${cellName(cell, board.size)} cannot contain ${this.lowerCrust}, because that would remove ${this.upperCrust} from its neighbors in ${this.specificName}, which leaves it with no candidates. Board is Invalid!`
              )
              return ConstraintResult.INVALID
            } else if (result === ConstraintResult.CHANGED) {
              logicStepDesc?.push(
                `${cellName(cell, board.size)} cannot contain ${this.lowerCrust}, because that would remove ${this.upperCrust} from its neighbors in ${this.specificName}`
              )
              return ConstraintResult.CHANGED
            }
          }
        }
      }
    } else {
      const validGroups = this.validGroups(board)
      const crustMask = valueBit(this.upperCrust) | valueBit(this.lowerCrust)
      let changed = false

      if (validGroups.length === 0) {
        logicStepDesc?.push(
          `${this.specificName} has no more valid combinations. Board is Invalid!`
        )
        return ConstraintResult.INVALID
      }

      const groupsCrusts = validGroups.map(
        (group) => [
          this.cells[this.cells.indexOf(Math.min(...group.cells)) - 1],
          this.cells[this.cells.indexOf(Math.max(...group.cells)) + 1],
        ],
      )

      const requiredCrustCells = groupsCrusts[0].filter(
        (crustCell) => groupsCrusts.every((crusts) => crusts.includes(crustCell)),
      ).sort((a, b) => a - b)

      if (requiredCrustCells.length > 0) {
        for (let cell of requiredCrustCells) {
          const result = board.keepCellMask(cell, crustMask)
          if (result === ConstraintResult.UNCHANGED) continue

          logicStepDesc?.push(
            `${changed ? ',' : ''}${cellName(cell, board.size)}`
          )
          changed = true
          
          if (result === ConstraintResult.INVALID) {
            logicStepDesc?.push(
              ` must be a crust cell of ${this.specificName}, ${cellName(cell, board.size)} has no more valid candidates. Board is invalid!`
            )
            return ConstraintResult.INVALID
          }
        }
        if (changed) {
          logicStepDesc?.push(
            ` must be a crust cell of ${this.specificName}. Removing non-crust candidates.`
          )
          return ConstraintResult.CHANGED
        }

        if (requiredCrustCells.length === 2) {
          const seenByFirst = board.seenCells(requiredCrustCells[0])
          const seenBySecond = board.seenCells(requiredCrustCells[1])
          const seenByBoth = seenByFirst.filter((cell) => seenBySecond.includes(cell))
          if (seenByBoth.length > 0) {
            for (let cell of seenByBoth) {
              const result = board.clearCellMask(cell, crustMask)
              if (result === ConstraintResult.UNCHANGED) continue

              logicStepDesc?.push(
                `${changed ? ',' : ''}${cellName(cell, board.size)}`
              )
              changed = true

              if (result === ConstraintResult.INVALID) {
                logicStepDesc?.push(
                  ` are seen by both crust cells of ${this.specificName}. Removing crust candidates from those cells. ${cellName(cell, board.size)} has no remaining candidates. Board is Invalid!`
                )
                return ConstraintResult.INVALID
              }
            }
            if (changed) {
              logicStepDesc?.push(
                ` are seen by both crust cells of ${this.specificName}. Removing crust candidates from those cells.`
              )
              return ConstraintResult.CHANGED
            }
          }

          // now since the sum cells are known, finish with sum cells helper
          const sumCells = this.cells.slice(this.cells.indexOf(requiredCrustCells[0]) + 1, this.cells.indexOf(requiredCrustCells[1]))
          const sumHelper = new SumCellsHelper(board, sumCells)
          return sumHelper.logicStep(board, [this.sum], logicStepDesc)
        }
      }

      const sumCellsMasks = Array.from(
        { length: this.cells.length - 2 },
        () => this.givenBit,
      )

      const allSumCombinations: number[] = []
      for (let group of validGroups) {
        const { masks, sumCombinations } = group.restrictSumHelper(board, [this.sum])
        
        for (let i = 0; i < masks.length; i += 1) {
          const cellsIndex = this.cells.indexOf(group.cells[i])
          sumCellsMasks[cellsIndex - 1] |= masks[i]
        }

        if (sumCombinations) {
          allSumCombinations.push(
            ...sumCombinations.reduce((list, combo) => {
              if (allSumCombinations.includes(combo)) return list
              if (list.includes(combo)) return list
              return [...list, combo]
            }, [] as number[])
          )
        }
      }

      const requiredSumCells = validGroups[0].cells.filter(
        (cell) => validGroups.every(({ cells }) => cells.includes(cell)),
      )

      if (requiredSumCells.length > 0) {
        // cells are required for the sum, mask them based on possible sum combos
        for (let cell of requiredSumCells) {
          const cellsIndex = this.cells.indexOf(cell)
          const cellMask = sumCellsMasks[cellsIndex - 1]
          const result = board.keepCellMask(cell, cellMask)
          if (result === ConstraintResult.UNCHANGED) continue

          logicStepDesc?.push(
            `${changed ? ',' : ''}${cellName(cell, board.size)}`
          )
          changed = true

          if (result === ConstraintResult.INVALID) {
            logicStepDesc?.push(
              ` must be in the sum for ${this.specificName}. Reducing cells to valid sum candidates. ${cellName(cell, board.size)} has no valid candidates. Board is invalid!`
            )
            return ConstraintResult.INVALID
          }
        }
        if (changed) {
          logicStepDesc?.push(
            ` must be in the sum for ${this.specificName}. Reducing cells to valid sum candidates.`
          )
          return ConstraintResult.CHANGED
        }
        
        // check for required values in the sum
        const requiredSumValues = allSumCombinations.reduce((mask, comboMask) => mask & comboMask, this.allValues)
        if (popcount(requiredSumValues) > 0) {
          const cellValuePlacements: { value: number, cells: number[] }[] = []
          for (let value of valuesList(requiredSumValues)) {
            // value is required in sum, remove it from any cells seen by all places it could go in the sum
            const possibleCells = sumCellsMasks.reduce(
              (cells, cellMask, i) => {
                if (!hasValue(cellMask, value)) return cells
                return [...cells, this.cells[i + 1]]
              },
              [] as number[],
            )

            if (possibleCells.length === 0) {
              logicStepDesc?.push(
                `${this.specificName} requires a ${value} in its sum, but there is nowhere to place that value. Board is invalid!`
              )
              return ConstraintResult.INVALID
            }

            if (possibleCells.length === 1) {

              const result = board.keepCellMask(possibleCells[0], valueBit(value) | this.givenBit)
              if (result === ConstraintResult.UNCHANGED) continue

              logicStepDesc?.push(
                `${this.specificName} requires a ${value} in its sum, which must go in ${cellName(possibleCells[0], board.size)}`
              )

              if (result === ConstraintResult.INVALID) {
                logicStepDesc?.push(
                  ` which leaves it with no candidates. Board is invalid!`
                )
                return ConstraintResult.INVALID
              }
              return ConstraintResult.CHANGED
            }

            cellValuePlacements.push({ value, cells: possibleCells })
          }

          for (let { value, cells } of cellValuePlacements) {
            const seenByCellsList = cells.map((cell) => board.seenCells(cell))
            const seenByAll = seenByCellsList[0].filter(
              (cell) => seenByCellsList.every((cells) => cells.includes(cell))
            )

            if (seenByAll.length > 0) {
              // value cannot be in cells seen by all
              for (let cell of seenByAll) {
                const result = board.clearCellMask(cell, valueBit(value))
                if (result === ConstraintResult.UNCHANGED) continue

                if (!changed) {
                  changed = true
                  logicStepDesc?.push(
                    `${this.specificName} must have a ${value} in its sum, which removes that value from ${cellName(cell, board.size)}`
                  )
                } else {
                  logicStepDesc?.push(
                    `,${cellName(cell, board.size)}`
                  )
                }

                if (result === ConstraintResult.INVALID) {
                  logicStepDesc?.push(
                    `. ${cellName(cell, board.size)} has no remaining candidates. Board is invalid!`
                  )
                  return ConstraintResult.INVALID
                }
              }
              if (changed) return ConstraintResult.CHANGED
            }
          }
        }
      }
    }

    return ConstraintResult.UNCHANGED
  }

  get lowerCrust() {
    return minValue(this.allValues)
  }

  get upperCrust() {
    return maxValue(this.allValues)
  }

  get maxSum() {
    const availableSumValues = this.maskBetweenExclusive(1, maxValue(this.allValues))
    return valuesList(availableSumValues).reduce((sum, value) => sum + value, 0)
  }

  private validGroups(board: Board) {
    return this.sumGroups.filter(
      (group) => {
        if (!group.isSumPossible(board, this.sum)) return false
        const crustCells = [
          this.cells[this.cells.indexOf(Math.min(...group.cells)) - 1],
          this.cells[this.cells.indexOf(Math.max(...group.cells)) + 1],
        ]

        if (hasValue(board.cells[crustCells[0]], this.lowerCrust) && hasValue(board.cells[crustCells[1]], this.upperCrust)) return true
        if (hasValue(board.cells[crustCells[0]], this.upperCrust) && hasValue(board.cells[crustCells[1]], this.lowerCrust)) return true

        return false
      }
    )
  }
}

export function register() {
  registerConstraint(
    'sandwichsum',
    (board, params, definition) => {
      let cells: undefined|any[]
      if (definition?.cells) {
        cells = definition.cells(params, board.size)
      } else if (params.cell) {
        const match = (params.cell as string).match(/^R(?<row>-{0,1}\d+)C(?<column>-{0,1}\d+)$/)
        if (match?.groups) {
          const { row: rawRow, column: rawColumn } = match.groups
          const row = parseInt(rawRow, 10)
          const column = parseInt(rawColumn, 10)

          const isColumnSum = row === 0 || row === board.size + 1
          const isRowSum = column === 0 || column === board.size + 1
          if (isRowSum && isColumnSum) return []

          if (isRowSum) {
            cells = Array.from(
              { length: board.size },
              (_, i) => `R${i + 1}C${column}`
            )
          } else if (isColumnSum) {
            cells = Array.from(
              { length: board.size },
              (_, i) => `R${row}C${i + 1}`
            )
          }
        }
      }
      if (!cells?.length) return []

      const sum = definition?.value ? definition.value(params) : params.value

      if (sum === null || sum === undefined) return []
      return new SandwichSumConstraint(
        board,
        { cells, sum },
      )
    }
  )
}
