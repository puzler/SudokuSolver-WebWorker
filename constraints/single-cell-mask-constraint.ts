import type Board from '../board'
import { registerConstraint } from '../constraint-builder'
import { cellName, valueBit } from '../solve-utility'
import { cellIndexFromAddress } from '../solve-worker'
import Constraint from './constraint'

export default class SingleCellMaskConstraint extends Constraint {
  constructor(constraintName: string, board: Board, { cell, mask }: { cell: any, mask: number }) {
    const cellIndex = cellIndexFromAddress(cell, board.size)
    const specificName = `${constraintName} at ${cellName(cellIndex, board.size)}`
    super(board, constraintName, specificName)

    this.cell = cellIndex
    this.mask = mask
  }

  cell: number
  mask: number

  init(board: Board, isRepeat: boolean) {
    return board.keepCellMask(this.cell, this.mask)
  }
}

export function register() {
  registerConstraint(
    'even',
    (board, params, definition) => {
      const cell = definition?.cell ? definition.cell(params) : params.cell

      let mask = 0
      for (let i = 2; i <= board.size; i += 2) mask |= valueBit(i)

      return new SingleCellMaskConstraint(
        'Even Cell',
        board,
        { cell, mask },
      )
    }
  )

  registerConstraint(
    'odd',
    (board, params, definition) => {
      const cell = definition?.cell ? definition.cell(params) : params.cell

      let mask = 0
      for (let i = 1; i <= board.size; i += 2) mask |= valueBit(i)

      return new SingleCellMaskConstraint(
        'Odd Cell',
        board,
        { cell, mask },
      )
    }
  )
}
