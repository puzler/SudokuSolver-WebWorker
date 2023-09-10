import type Board from '../board';
import { registerConstraint, registerAggregateConstraint } from '../constraint-builder';
import { cellIndexFromAddress } from '../solve-worker';
import { cellName } from '../solve-utility';
import Constraint, { ConstraintResult } from './constraint';

export default class ExtraRegionConstraint extends Constraint {
  constructor(
    constraintName: string,
    board: Board,
    { cells }: { cells: number[] },
  ) {
    const specificName = `${constraintName} at ${cellName(cells[0], board.size)}`
    super(board, constraintName, specificName)
    this.cells = cells.sort((a, b) => a - b);
    this.cellsSet = new Set(this.cells);
  }

  cells: number[]
  cellsSet: Set<number>

  init(board: Board, isRepeat: boolean) {
    if (isRepeat) return ConstraintResult.UNCHANGED

    board.addRegion(this.specificName, this.cells, 'extra region constraint', this);
    return ConstraintResult.CHANGED
  }
}

export function register() {
  registerConstraint(
    'extraregion',
    (board, params, definition) => {
      const cells = definition?.cells ? definition.cells(params) : params.cells
      if (!cells || cells.length < 2) return []

      return new ExtraRegionConstraint(
        'Extra Region',
        board,
        { cells: cells.map((cell: any) => cellIndexFromAddress(cell, board.size)) },
      )
    }
  )

  registerAggregateConstraint(
    (board, boardData, definition) => {
      const antiKingEnabled = definition?.constraints?.antiking ? definition.constraints.antiking(boardData) : boardData.antiking
      if (!antiKingEnabled) return []

      return board.cells.flatMap(
        (_, index) => {
          const originRow = Math.floor(index / 9)
          const kingCells = [
            index + board.size - 1,
            index + board.size + 1,
          ]

          return kingCells.reduce((constraints, cell) => {
            if (Math.floor(cell / 9) !== originRow + 1) return constraints
            if (cell < 0 || cell >= board.cells.length) return constraints

            return [
              ...constraints,
              new ExtraRegionConstraint(
                'Anti King',
                board,
                { cells: [index, cell] },
              ),
            ]
          }, [] as ExtraRegionConstraint[])
        }
      )
    }
  )

  registerAggregateConstraint(
    (board, boardData, definition) => {
      const antiKnightEnabled = definition?.constraints?.antiknight ? definition.constraints.antiknight(boardData) : boardData.antiknight
      if (!antiKnightEnabled) return []

      return board.cells.flatMap(
        (_, index) => {
          const originRow = Math.floor(index / 9)

          const knightCells = [
            ...[
              index + board.size - 2,
              index + board.size + 2,
            ].filter((cell) => Math.floor(cell / 9) === originRow + 1),
            ...[
              index + (2 * board.size) - 1,
              index + (2 * board.size) + 1,
            ].filter((cell) => Math.floor(cell / 9) === originRow + 2),
          ]

          return knightCells.reduce(
            (cellKingList, cell) => {
              if (cell < 0 || cell >= board.cells.length) return cellKingList

              return [
                ...cellKingList,
                new ExtraRegionConstraint(
                  'Anti Knight',
                  board,
                  { cells: [index, cell] },
                ),
              ]
            },
            [] as ExtraRegionConstraint[],
          )
        }
      )
    }
  )

  registerAggregateConstraint(
    (board, boardData, definition) => {
      const constraints: ExtraRegionConstraint[] = []

      const positiveDefinition = definition?.constraints ? definition.constraints['diagonal+'] : undefined
      const positiveDiagonalEnabled = positiveDefinition ? positiveDefinition(boardData) : boardData['diagonal+']
      if (positiveDiagonalEnabled) {
        const positiveCells: number[] = []
        for (let i = 0; i < board.size; i += 1) {
          positiveCells.push(
            (board.size * (board.size - 1 - i)) + i,
          )
        }

        constraints.push(
          new ExtraRegionConstraint(
            'Diagonals',
            board,
            { cells: positiveCells },
          ),
        );
      }

      const negativeDefinition = definition?.constraints ? definition.constraints['diagonal-'] : undefined
      const negativeDiagonalEnabled = negativeDefinition ? negativeDefinition(boardData) : boardData['diagonal-']
      if (negativeDiagonalEnabled) {
        const negativeCells: number[] = []
        for (let i = 0; i < board.size; i += 1) {
          negativeCells.push(i + (i * board.size))
        }

        constraints.push(
          new ExtraRegionConstraint(
            'Diagonals',
            board,
            { cells: negativeCells },
          ),
        );
      }

      return constraints
    }
  )

  registerAggregateConstraint(
    (board, boardData, definition) => {
      const disjointGroupsEnabled = definition?.constraints?.disjointgroups ? definition.constraints.disjointgroups(boardData) : boardData.disjointgroups
      if (!disjointGroupsEnabled) return []

      const groups: number[][] = []
      const baseRegions = board.regions.filter(({ type }) => type === 'region')
      for (let i = 0; i < board.size; i += 1) {
        groups.push(baseRegions.map(
          (region) => region.cells[i],
        ))
      }

      return groups.map((cells) => new ExtraRegionConstraint(
        'Disjoint Sets',
        board,
        { cells },
      ))
    }
  )
}
