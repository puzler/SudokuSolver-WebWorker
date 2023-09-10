import type Board from '../board'
import Constraint, { ConstraintResult } from './constraint'
import { cellIndexFromAddress } from '../solve-worker'
import { cellName, combinations, hasValue } from '../solve-utility'
import { registerConstraint } from '../constraint-builder'

export default class EqualCellsConstraint extends Constraint {
  constructor(
    constraintName: string,
    specificName: string,
    board: Board,
    { cells }: { cells: number[] },
  ) {
    super(board, constraintName, specificName)

    this.cells = cells.map(
      (cellAddress) => cellIndexFromAddress(cellAddress, board.size),
    ).sort((a, b) => a - b)
    this.cellsSet = new Set(this.cells)
  }

  cells: number[]
  cellsSet: Set<number>

  init(board: Board, isRepeat: boolean) {
    if (isRepeat) return ConstraintResult.UNCHANGED
    if (this.cells.length < 2) return ConstraintResult.UNCHANGED
    
    for(let [cell1, cell2] of combinations(this.cells, 2)) {
      if (board.seenCells(cell1).includes(cell2)) return ConstraintResult.INVALID
      board.addCloneWeakLinks(cell1, cell2)
    }

    return ConstraintResult.CHANGED
  }

  enforce(board: Board, cellIndex: number, value: number) {
    if (!this.cellsSet.has(cellIndex)) return true

    const givenVals = this.getGivenVals(board)
    if (givenVals.length > 1) return false
    if (givenVals.length === 1) {
      if (this.cells.some((cell) => !hasValue(board.cells[cell], givenVals[0]))) return false
      return true
    }

    const possibleMask = this.cells.reduce((mask, cell) => mask & board.cells[cell], board.allValues)
    if (possibleMask === 0) return false

    return true
  }

  logicStep(board: Board, logicalStepDesc: null|string[]) {
    const newMask = this.cells.reduce(
      (mask, cell) => mask & board.cells[cell], board.allValues,
    )

    if (newMask === 0) {
      logicalStepDesc?.push(`${this.specificName} has no possible values`)
      return ConstraintResult.INVALID
    }

    let results: (0|1|2)[] = []

    for (let cell of this.cells) {
      const cellMask = board.cells[cell] & ~board.givenBit
      if (cellMask === (newMask & ~board.givenBit)) continue

      if (logicalStepDesc) {
        const removedValues = cellMask & ~newMask
        if (removedValues !== 0) {
          logicalStepDesc.push(`${this.specificName} eliminates ${board.compactName([cell], removedValues)}`)
        }
      }

      results.push(board.keepCellMask(cell, newMask))
    }

    return Math.max(...results) as 0|1|2
  }

  getGivenVals(board: Board) {
    return this.cells.reduce(
      (vals, cell) => {
        if (!board.isGiven(cell)) return vals
        const val = board.getValue(cell)
        if (vals.includes(val)) return vals
        return [...vals, val]
      },
      [] as number[],
    )
  }
}

export function register() {
  registerConstraint(
    'palindrome',
    (board, params, definition) => {
      const lines = definition?.lines ? definition.lines(params) : params.lines
      return lines.flatMap(
        (line: any[]) => {
          const constraints: EqualCellsConstraint[] = []
          const specificName = `Palindrome at ${cellName(cellIndexFromAddress(line[0], board.size), board.size)}`
          for (let i = 0; i < Math.floor(line.length / 2); i += 1) {
            const cells = [line[i], line[line.length - i - 1]]
            constraints.push(
              new EqualCellsConstraint(
                'Palindrome',
                specificName,
                board,
                { cells },
              )
            )
          }
          return constraints
        }
      )
    }
  )

  registerConstraint(
    'clone',
    (board, params, definition) => {
      const cellGroups = definition?.cloneGroups ? definition.cloneGroups(params) : [params.cells, params.cloneCells]
      if (cellGroups.some((group: any[]) => group.length !== cellGroups[0].length)) return []

      const constraints: EqualCellsConstraint[] = []

      for (let i = 0; i < cellGroups[0].length; i += 1) {
        const cells = cellGroups.map((group: any[]) => group[i])
        const specificName = `Clone Cells ${cells.map((cell: any) => cellName(cellIndexFromAddress(cell, board.size), board.size)).join(',')}`
        constraints.push(new EqualCellsConstraint(
          'Clone',
          specificName,
          board,
          { cells },
        ))
      }

      return constraints
    }
  )
}