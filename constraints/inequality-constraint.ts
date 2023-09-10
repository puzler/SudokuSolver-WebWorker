import type Board from '../board'
import Constraint from './constraint'
import { registerAggregateConstraint, registerConstraint } from '../constraint-builder'
import { cellIndexFromAddress } from '../solve-worker'
import { cellName, maxValue, minValue, valuesList } from '../solve-utility'

export default class InequalityConstraint extends Constraint {
  constructor(constraintName: string, specificName: string, board: Board, params: { originCell: number, inequalCells: number[], inequality: 'lt'|'gt' }) {
    super(board, constraintName, specificName)

    this.originCell = params.originCell
    this.inequalCells = params.inequalCells
    this.inequality = params.inequality
  }

  originCell: number
  inequalCells: number[]
  inequality: 'lt'|'gt'

  init(board: Board, isRepeat: boolean) {
    const results: (0|1|2)[] = []
    const allInequalMask = this.inequalCells.reduce((mask, cell) => board.cells[cell] & mask, board.allValues)

    const originAllowed = this.inequality === 'lt'
      ? board.maskStrictlyLower(maxValue(allInequalMask))
      : board.maskStrictlyHigher(minValue(allInequalMask))
    results.push(board.keepCellMask(this.originCell, originAllowed))

    const inequalAllowed = this.inequality === 'lt'
      ? board.maskStrictlyHigher(minValue(board.cells[this.originCell]))
      : board.maskStrictlyLower(maxValue(board.cells[this.originCell]))

    for (let cell of this.inequalCells) {
      results.push(board.keepCellMask(cell, inequalAllowed))
    }

    if (!isRepeat) this.initWeakLinks(board)

    return Math.max(...results) as 0|1|2
  }

  checkValues(originVal: number, inequalVal: number) {
    if (this.inequality === 'lt') {
      return originVal < inequalVal
    }

    return originVal > inequalVal
  }

  initWeakLinks(board: Board) {
    for (let originVal of valuesList(board.cells[this.originCell])) {
      for (let inequalCell of this.inequalCells) {
        for (let inequalVal of valuesList(board.cells[inequalCell])) {
          if (!this.checkValues(originVal, inequalVal)) {
            board.addWeakLink(
              board.candidateIndex(this.originCell, originVal),
              board.candidateIndex(inequalCell, inequalVal),
            )
          }
        }
      }
    }
  }
}

export function register() {
  registerAggregateConstraint(
    (board, boardData, boardDefinition) => {
      const definition = boardDefinition?.constraints?.minimum
      const rawMinimums = definition?.collector ? definition.collector(boardData) : boardData.minimum
      if (!rawMinimums || rawMinimums.length === 0) return []

      const minCells: number[] = rawMinimums.map(
        (rawCell: any) => {
          const cell = definition?.cell ? definition.cell(rawCell) : rawCell.cell
          return cellIndexFromAddress(cell, board.size)
        }
      )

      const list = minCells.reduce(
        (constraints, minCell) => {
          const originRow = Math.floor(minCell / board.size)
          const inequalCells = [
            ...[
              minCell + 1,
              minCell - 1,
            ].filter((cell) => Math.floor(cell / board.size) === originRow),
            minCell - board.size,
            minCell + board.size,
          ].filter((cell) => {
            if (cell < 0) return false
            if (cell >= Math.pow(board.size, 2)) return false
            if (minCells.includes(cell)) return false
            return true
          })

          if (inequalCells.length === 0) return constraints
          return [
            ...constraints,
            new InequalityConstraint(
              'Minimum',
              `Minimum Cell at ${cellName(minCell, board.size)}`,
              board,
              {
                originCell: minCell,
                inequalCells,
                inequality: 'lt',
              },
            ),
          ]
        },
        [] as InequalityConstraint[],
      )

      return list
    }
  )

  registerAggregateConstraint(
    (board, boardData, boardDefinition) => {
      const definition = boardDefinition?.constraints?.maximum
      const rawMaximums = definition?.collector ? definition.collector(boardData) : boardData.maximum
      if (!rawMaximums || rawMaximums.length === 0) return []

      const maxCells: number[] = rawMaximums.map(
        (rawCell: any) => {
          const cell = definition?.cell ? definition.cell(rawCell) : rawCell.cell
          return cellIndexFromAddress(cell, board.size)
        },
      )

      return maxCells.reduce(
        (constraints, maxCell) => {
          const originRow = Math.floor(maxCell / board.size)
          const inequalCells = [
            ...[
              maxCell + 1,
              maxCell - 1,
            ].filter((cell) => Math.floor(cell / board.size) === originRow),
            maxCell - board.size,
            maxCell + board.size,
          ].filter((cell) => {
            if (cell < 0) return false
            if (cell >= Math.pow(board.size, 2)) return false
            if (maxCells.includes(cell)) return false
            return true
          })

          if (inequalCells.length === 0) return constraints
          return [
            ...constraints,
            new InequalityConstraint(
              'Maximum',
              `Maximum Cell at ${cellName(maxCell, board.size)}`,
              board,
              {
                originCell: maxCell,
                inequalCells,
                inequality: 'gt',
              },
            ),
          ]
        },
        [] as InequalityConstraint[],
      )
    }
  )
}
