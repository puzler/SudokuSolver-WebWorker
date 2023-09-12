import type Board from '../board'
import Constraint, { ConstraintResult } from './constraint'
import { registerConstraint, registerAggregateConstraint } from '../constraint-builder'
import { cellIndexFromAddress } from '../solve-worker'
import { cellName, hasValue, maskToString, valueBit, valuesList } from '../solve-utility'

export default class RegionIndexCellConstraint extends Constraint {
  constructor(constraintName: string, board: Board, params: { cells: any[], value: number, cell: any }) {
    const cell = cellIndexFromAddress(params.cell, board.size)
    super(board, constraintName, `${constraintName} at ${cellName(cell, board.size)}`)

    this.cells = params.cells.map(cellAddress => cellIndexFromAddress(cellAddress, board.size))
    this.indexedValue = params.value
    this.indexCell = cell
  }

  cells: number[]
  indexedValue: number
  indexCell: number

  init(board: Board, isRepeat: boolean) {
    return ConstraintResult.UNCHANGED
  }

  logicStep(board: Board, logicStepDesc: null|string[]) {
    if (this.indexedValue <= 0 || this.indexedValue > board.size) return ConstraintResult.INVALID

    if (board.isGiven(this.indexCell)) {
      const index = board.getValue(this.indexCell)
      if (board.isGiven(this.cells[index - 1])) {
        const indexedIsCorrect = board.getValue(this.cells[index - 1]) === this.indexedValue
        if (indexedIsCorrect) return ConstraintResult.UNCHANGED

        logicStepDesc?.push(
          `${this.specificName} forces ${cellName(this.cells[index - 1], board.size)} to be ${this.indexedValue}, but it is set to ${board.getValue(this.cells[index - 1])}. Board is Invalid!`
        )
        return ConstraintResult.INVALID
      } else {
        logicStepDesc?.push(
          `${this.specificName} forces ${cellName(this.cells[index - 1], board.size)} to be ${this.indexedValue}`
        )
        if (board.setAsGiven(this.cells[index - 1], this.indexedValue)) return ConstraintResult.CHANGED

        logicStepDesc?.push(' but it cannot be. Board is invalid!')
        return ConstraintResult.INVALID
      }
    }

    const setIndex = this.cells.findIndex((cell) => board.isGiven(cell) && board.getValue(cell) === this.indexedValue)
    if (setIndex >= 0) {
      logicStepDesc?.push(
        `${this.indexedValue} in ${cellName(this.cells[setIndex], board.size)} forces ${cellName(this.indexCell, board.size)} to be ${setIndex + 1} to satisfy ${this.specificName}`
      )
      if (board.setAsGiven(this.indexCell, setIndex + 1)) return ConstraintResult.CHANGED

      logicStepDesc?.push(' but it cannot be that value. Board is invalid!')
      return ConstraintResult.INVALID
    }

    let removedCandidates = 0
    for (let i = 1; i <= board.size; i += 1) {
      if (!hasValue(board.cells[this.indexCell], i)) continue
      if (hasValue(board.cells[this.cells[i - 1]], this.indexedValue)) continue

      const result = board.clearCellMask(this.indexCell, valueBit(i))
      if (result === ConstraintResult.UNCHANGED) continue

      removedCandidates |= valueBit(i)
      if (result === ConstraintResult.INVALID) {
        const removedIndexCells = valuesList(removedCandidates).map((index) => this.cells[index - 1])
        logicStepDesc?.push(
          `${board.compactName(removedIndexCells)} cannot contain ${this.indexedValue}, which removes ${maskToString(removedCandidates, board.size)} from ${this.specificName}`,
          ' which leaves it with no candidates. Board is invalid!'
        )
        return ConstraintResult.INVALID
      }
    }
    if (removedCandidates !== 0) {
      const removedIndexCells = valuesList(removedCandidates).map((index) => this.cells[index - 1])
      logicStepDesc?.push(
        `${board.compactName(removedIndexCells)} cannot contain ${this.indexedValue}, which removes ${maskToString(removedCandidates, board.size)} from ${this.specificName}`,
      )
      return ConstraintResult.CHANGED
    }

    let removedCellIndexes = 0
    for (let i = 0; i < this.cells.length; i += 1) {
      if (!hasValue(board.cells[this.cells[i]], this.indexedValue)) continue
      if (hasValue(board.cells[this.indexCell], i + 1)) continue

      const result = board.clearCellMask(this.cells[i], valueBit(this.indexedValue))
      if (result === ConstraintResult.UNCHANGED) continue

      removedCellIndexes |= valueBit(i + 1)
      if (result === ConstraintResult.INVALID) {
        const removedFromCells = valuesList(removedCellIndexes).map((index) => this.cells[index - 1])
        logicStepDesc?.push(
          `${this.specificName} does not contain ${maskToString(removedCellIndexes, board.size)}, which removes ${this.indexedValue} from ${board.compactName(removedFromCells)}`,
          ` which leaves ${cellName(this.cells[i], board.size)} with no valid candidates. Board is invalid!`
        )
        return ConstraintResult.INVALID
      }
    }
    if (removedCellIndexes !== 0) {
      const removedFromCells = valuesList(removedCellIndexes).map((index) => this.cells[index - 1])
      logicStepDesc?.push(
        `${this.specificName} does not contain ${maskToString(removedCellIndexes, board.size)}, which removes ${this.indexedValue} from ${board.compactName(removedFromCells)}`
      )
      return ConstraintResult.CHANGED
    }

    return ConstraintResult.UNCHANGED
  }
}

export function register() {
  registerConstraint(
    'rowindexcell',
    (board, params, definition) => {
      const cell = definition?.cell ? definition.cell(params) : params.cell
      if (!cell) return []

      let column: number|undefined
      let cells: undefined|null|any[]
      if (definition?.cells) {
        cells = definition.cells(params, board.size)
      } else {
        const match = (cell as string).match(/^R(?<row>-{0,1}\d+)C(?<column>-{0,1}\d+)$/)
        if (!match?.groups) return []

        const { row: rawRow, column: rawColumn } = match.groups
        const row = parseInt(rawRow, 10)
        column = parseInt(rawColumn, 10)
        if (!Number.isFinite(row)) return []

        cells = Array.from(
          { length: board.size },
          (_, i) => `R${row}C${i + 1}`
        )
      }
      if (!cells) return []

      let value: number
      if (definition?.value) {
        value = definition.value(params)
      } else {
        if (!column) {
          const match = (cell as string).match(/^R-{0,1}\d+C(?<column>-{0,1}\d+)$/)
          if (!match?.groups) return []
  
          const { column: rawColumn } = match.groups
          column = parseInt(rawColumn, 10)
        }
        if (!Number.isFinite(column)) return []

        value = column
      }
      if (!Number.isFinite(value)) return []

      return new RegionIndexCellConstraint(
        'Row Index Cell',
        board,
        { cells, value, cell },
      )
    }
  )

  registerConstraint(
    'columnindexcell',
    (board, params, definition) => {
      const cell = definition?.cell ? definition.cell(params) : params.cell
      if (!cell) return []

      let row: number|undefined
      let cells: undefined|null|any[]
      if (definition?.cells) {
        cells = definition.cells(params, board.size)
      } else {
        const match = (cell as string).match(/^R(?<row>-{0,1}\d+)C(?<column>-{0,1}\d+)$/)
        if (!match?.groups) return []

        const { row: rawRow, column: rawColumn } = match.groups
        const column = parseInt(rawColumn, 10)
        row = parseInt(rawRow, 10)
        if (!Number.isFinite(column)) return []

        cells = Array.from(
          { length: board.size },
          (_, i) => `R${i + 1}C${column}`
        )
      }
      if (!cells) return []

      let value: number
      if (definition?.value) {
        value = definition.value(params)
      } else {
        if (!row) {
          const match = (cell as string).match(/^R(?<row>-{0,1}\d+)C-{0,1}\d+$/)
          if (!match?.groups) return []
  
          const { row: rawRow } = match.groups
          row = parseInt(rawRow, 10)
        }
        if (!Number.isFinite(row)) return []

        value = row
      }
      if (!Number.isFinite(value)) return []

      return new RegionIndexCellConstraint(
        'Column Index Cell',
        board,
        { cells, value, cell },
      )
    }
  )

  registerConstraint(
    'numberedroom',
    (board, params, definition) => {
      const value = definition?.value ? definition.value(params) : params.value
      if (!Number.isFinite(value)) return []

      let cells: undefined|null|any[]
      if (definition?.cells) {
        cells = definition.cells(params, board.size)
      } else if (params.cell) {
        const match = (params.cell as string).match(/^R(?<row>-{0,1}\d+)C(?<column>-{0,1}\d+)$/)
        if (match?.groups) {
          const { row: rawRow, column: rawColumn } = match.groups
          const row = parseInt(rawRow, 10)
          const column = parseInt(rawColumn, 10)

          const isColumnClue = row === 0 || row === board.size + 1
          const isRowClue = column === 0 || column === board.size + 1
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
      }
      if (!cells?.length) return []

      return new RegionIndexCellConstraint(
        'Numbered Rooms',
        board,
        { cells, value, cell: cells[0] },
      )
    }
  )

  registerAggregateConstraint(
    (board, boardData, boardDefinition) => {
      const definition = boardDefinition?.constraints?.regionindexcell
      const instances = definition?.collector ? definition.collector(boardData) : boardData.regionindexcell
      if (!instances) return []

      return instances.reduce(
        (constraints: RegionIndexCellConstraint[], instance: any) => {
          const cell = definition?.cell ? definition.cell(instance) : instance.cell
          if (!cell) return constraints

          let cells: undefined|null|any[]
          let region: undefined|number
          if (definition?.value) region = definition.value(instance, boardData)
          if (definition?.cells) cells = definition?.cells(instance, boardData)

          if (!Number.isFinite(region)) {
            const cellIndex = cellIndexFromAddress(cell, board.size)
            let foundRegions: string[] = []
            for (let i = 0; i <= cellIndex; i += 1) {
              const cellRegion = board.getRegionsForCell(i, 'region')[0]
              const regionId = cellRegion.cells.join(',')

              if (!foundRegions.includes(regionId)) {
                foundRegions.push(regionId)
              }

              if (cellRegion.cells.includes(cellIndex)) {
                region = foundRegions.indexOf(regionId) + 1
                if (!cells?.length) {
                  cells = [...cellRegion.cells].sort((a, b) => a - b)
                }
                break
              }
            }
          }

          if (!Number.isFinite(region)) return constraints
          if (!cells?.length) return constraints

          return [
            ...constraints,
            new RegionIndexCellConstraint(
              'Region Index Cell',
              board,
              { cells, value: region!, cell }
            ),
          ]
        },
        [] as RegionIndexCellConstraint[],
      )
    }
  )
}
