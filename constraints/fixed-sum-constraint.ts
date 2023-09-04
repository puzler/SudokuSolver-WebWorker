import type Board from "../board";
import { registerConstraint } from "../constraint-builder";
import { valueBit, hasValue } from "../solve-utility";
import { cellIndexFromAddress } from "../solve-worker";
import SumCellsHelper from "../sum-cells-helper";
import Constraint, { ConstraintResult } from "./constraint";

export default class FixedSumConstraint extends Constraint {
    constructor(constraintName: string, specificName: string, board: Board, params: { cells: any[], sum: number }) {
        const cells = params.cells.map(cellAddress => cellIndexFromAddress(cellAddress, board.size));
        super(board, constraintName, specificName);

        this.sum = params.sum;
        this.cells = cells.sort((a, b) => a - b);
        this.cellsSet = new Set(this.cells);
    }

    sum: number
    cells: number[]
    cellsSet: Set<number>
    sumHelper?: SumCellsHelper

    init(board: Board, isRepeat: boolean) {
        // Size 1 is just a given
        if (this.cells.length === 1) {
            if (isRepeat) {
                return ConstraintResult.UNCHANGED;
            }
            if (this.sum > this.size) {
                return ConstraintResult.INVALID;
            }

            const cell = this.cells[0];
            return board.keepCellMask(cell, valueBit(this.sum));
        }

        // Size 2 act like sum dots via weak links
        if (this.cells.length === 2) {
            delete this.sumHelper;

            const [cell1, cell2] = this.cells;
            const valueUsed1 = Array.from({ length: this.size + 1 }, () => false);
            const valueUsed2 = Array.from({ length: this.size + 1 }, () => false);
            for (let value1 = 1; value1 <= this.size; value1++) {
                if (!hasValue(board.cells[cell1], value1)) {
                    continue;
                }
                const cell1Candidate = board.candidateIndex(cell1, value1);

                for (let value2 = 1; value2 <= this.size; value2++) {
                    if (!hasValue(board.cells[cell2], value2)) {
                        continue;
                    }

                    // Check for a weak link between these candidates
                    const cell2Candidate = board.candidateIndex(cell2, value2);
                    if (board.isWeakLink(cell1Candidate, cell2Candidate)) {
                        continue;
                    }

                    if (value1 + value2 !== this.sum) {
                        if (!isRepeat) {
                            board.addWeakLink(cell1Candidate, cell2Candidate);
                        }
                    } else {
                        valueUsed1[value1] = true;
                        valueUsed2[value2] = true;
                    }
                }

                // Only keep candidates used by the sum
                const valueUsedMask1 = valueUsed1.reduce((mask, used, value) => (used ? mask | valueBit(value) : mask), 0);
                const valueUsedMask2 = valueUsed2.reduce((mask, used, value) => (used ? mask | valueBit(value) : mask), 0);
                const result1 = board.keepCellMask(cell1, valueUsedMask1);
                const result2 = board.keepCellMask(cell2, valueUsedMask2);

                if (result1 === ConstraintResult.INVALID || result2 === ConstraintResult.INVALID) {
                    return ConstraintResult.INVALID;
                }

                if (result1 === ConstraintResult.CHANGED || result2 === ConstraintResult.CHANGED) {
                    return ConstraintResult.CHANGED;
                }

                return ConstraintResult.UNCHANGED;
            }

            return ConstraintResult.UNCHANGED;
        }

        // Create the sum helper which does most of the work
        this.sumHelper = new SumCellsHelper(board, this.cells);
        return this.sumHelper.init(board, [this.sum]);
    }

    enforce(board: Board, cellIndex: number, value: number) {
        if (this.cellsSet.has(cellIndex)) {
            const givenSum = this.getGivenSum(board);
            if (givenSum > this.sum || (givenSum !== this.sum && this.isCompleted(board))) {
                return false;
            }
        }
        return true;
    }

    logicStep(board: Board, logicalStepDescription: string[]) {
        if (this.sumHelper) {
            return this.sumHelper.logicStep(board, [this.sum], logicalStepDescription);
        }
        return ConstraintResult.UNCHANGED;
    }

    // Returns if all the cells in the cage are givens
    isCompleted(board: Board) {
        return this.cells.every(cell => board.isGiven(cell));
    }

    // Returns the sum of all the given cells in the cage
    getGivenSum(board: Board) {
        return this.cells
            .filter(cell => board.isGiven(cell))
            .map(cell => board.getValue(cell))
            .reduce((result, value) => result + value, 0);
    }
}

export function register() {
    registerConstraint('littlekillersum', (board, params, definition) => {
        const value = definition?.value ? definition.value(params) : params.value
        if (!value) {
            return [];
        }

        const clueCellName = definition?.clueCellName ? definition.clueCellName(params, board.size) : params.cell;
        const lkParams = {
            cells: definition?.cells ? definition.cells(params) : params.cells,
            sum: typeof value === 'string' ? parseInt(value, 10) : value,
        };

        const constraintName = 'Little Killer';
        const specificName = `Little Killer ${value} at ${clueCellName}`;
        return new FixedSumConstraint(constraintName, specificName, board, lkParams);
    });
}
