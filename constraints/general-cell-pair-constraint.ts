import type Board from "../board";
import { registerAggregateConstraint } from "../constraint-builder";
import { hasValue, valueBit } from "../solve-utility";
import { cellIndexFromAddress } from "../solve-worker";
import Constraint, { ConstraintResult } from "./constraint";

export default class GeneralCellPairConstraint extends Constraint {
    constructor(
        constraintName: string,
        specificName: string,
        constraintGroup: string,
        isPairAllowed: (val1: number, val2: number) => boolean,
        negativePairsGenerator: ((board: Board) => Generator<any[], void, unknown>) | null,
        board: Board,
        params: { cellsPairs: any[][] },
    ) {
        const cellPairs = params.cellsPairs.map(cells => cells.map(cellAddress => cellIndexFromAddress(cellAddress, board.size)).sort((a, b) => a - b));
        super(board, constraintName, specificName);

        this.cellPairs = cellPairs;
        this.cellPairKeys = cellPairs.map(cellPair => cellPair[0] * board.size * board.size + cellPair[1]);
        this.cellsSet = new Set(this.cells);
        this.constraintGroup = constraintGroup;
        this.isPairAllowed = isPairAllowed;
        this.negativePairsGenerator = negativePairsGenerator;
    }

    cells?: any[]
    cellPairs: any
    cellPairKeys: any
    cellsSet: Set<any>
    constraintGroup: any
    isPairAllowed: any
    negativePairsGenerator: any

    init(board: Board, isRepeat: boolean) {
        // Positive constraint weak links
        let changed = false;
        for (let cellPair of this.cellPairs) {
            const [cell1, cell2] = cellPair;
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

                    if (!this.isPairAllowed(value1, value2)) {
                        board.addWeakLink(cell1Candidate, cell2Candidate);
                    } else {
                        valueUsed1[value1] = true;
                        valueUsed2[value2] = true;
                    }
                }
            }

            // Only keep candidates used in valid pairs
            const valueUsedMask1 = valueUsed1.reduce((mask, used, value) => (used ? mask | valueBit(value) : mask), 0);
            const valueUsedMask2 = valueUsed2.reduce((mask, used, value) => (used ? mask | valueBit(value) : mask), 0);
            const result1 = board.keepCellMask(cell1, valueUsedMask1);
            const result2 = board.keepCellMask(cell2, valueUsedMask2);

            if (result1 === ConstraintResult.INVALID || result2 === ConstraintResult.INVALID) {
                return ConstraintResult.INVALID;
            }

            if (result1 === ConstraintResult.CHANGED || result2 === ConstraintResult.CHANGED) {
                changed = true;
            }
        }

        // Negative constraint weak links
        if (this.negativePairsGenerator) {
            // Gather all cell pairs for this constraint and any in the same group
            const totalCells = board.size * board.size;
            const allCellPairs = new Set(this.cellPairKeys);
            for (const constraint of board.constraints) {
                if (constraint !== this && constraint instanceof GeneralCellPairConstraint && constraint.constraintGroup === this.constraintGroup) {
                    for (const cellPair of constraint.cellPairKeys) {
                        allCellPairs.add(cellPair);
                    }
                }
            }

            // Go through all cell pairs that aren't present in a constraint and
            // add weak links for any pairs that are not allowed
            for (let negativePair of this.negativePairsGenerator(board)) {
                const cell1 = negativePair[0] < negativePair[1] ? negativePair[0] : negativePair[1];
                const cell2 = negativePair[0] < negativePair[1] ? negativePair[1] : negativePair[0];
                const negativePairKey = cell1 * totalCells + cell2;
                if (allCellPairs.has(negativePairKey)) {
                    continue;
                }

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
                        const cell2Candidate = board.candidateIndex(cell2, value2);

                        if (board.isWeakLink(cell1Candidate, cell2Candidate)) {
                            continue;
                        }

                        if (this.isPairAllowed(value1, value2)) {
                            board.addWeakLink(cell1Candidate, cell2Candidate);
                        } else {
                            valueUsed1[value1] = true;
                            valueUsed2[value2] = true;
                        }
                    }
                }

				// Only keep candidates used in valid pairs
				const valueUsedMask1 = valueUsed1.reduce((mask, used, value) => (used ? mask | valueBit(value) : mask), 0);
				const valueUsedMask2 = valueUsed2.reduce((mask, used, value) => (used ? mask | valueBit(value) : mask), 0);
				const result1 = board.keepCellMask(cell1, valueUsedMask1);
				const result2 = board.keepCellMask(cell2, valueUsedMask2);

				if (result1 === ConstraintResult.INVALID || result2 === ConstraintResult.INVALID) {
					return ConstraintResult.INVALID;
				}

				if (result1 === ConstraintResult.CHANGED || result2 === ConstraintResult.CHANGED) {
					changed = true;
				}
            }
        }

        return changed ? ConstraintResult.CHANGED : ConstraintResult.UNCHANGED;
    }
}

function* orthogonalPairsGenerator(board: Board) {
    const { size } = board;
    for (let r1 = 0; r1 < size; r1++) {
        for (let c1 = 0; c1 < size; c1++) {
            const cell1 = board.cellIndex(r1, c1);

            if (r1 - 1 >= 0) {
                const cell2 = board.cellIndex(r1 - 1, c1);
                yield [cell1, cell2];
            }
            if (r1 + 1 < size) {
                const cell2 = board.cellIndex(r1 + 1, c1);
                yield [cell1, cell2];
            }
            if (c1 - 1 >= 0) {
                const cell2 = board.cellIndex(r1, c1 - 1);
                yield [cell1, cell2];
            }
            if (c1 + 1 < size) {
                const cell2 = board.cellIndex(r1, c1 + 1);
                yield [cell1, cell2];
            }
        }
    }
}

function* diagonalPairsGenerator(board: Board) {
    const { size } = board;
    for (let r1 = 0; r1 < size; r1++) {
        for (let c1 = 0; c1 < size; c1++) {
            const cell1 = board.cellIndex(r1, c1);

            if (r1 - 1 >= 0 && c1 - 1 >= 0) {
                const cell2 = board.cellIndex(r1 - 1, c1 - 1);
                yield [cell1, cell2];
            }
            if (r1 + 1 < size && c1 + 1 < size) {
                const cell2 = board.cellIndex(r1 + 1, c1 + 1);
                yield [cell1, cell2];
            }
            if (r1 - 1 >= 0 && c1 + 1 < size) {
                const cell2 = board.cellIndex(r1 - 1, c1 + 1);
                yield [cell1, cell2];
            }
            if (r1 + 1 < size && c1 - 1 >= 0) {
                const cell2 = board.cellIndex(r1 + 1, c1 - 1);
                yield [cell1, cell2];
            }
        }
    }
}

export function register() {
    // Register a difference constraint
    registerAggregateConstraint((board, boardData, boardDefinition) => {
        const definition = boardDefinition?.constraints?.difference
        const list = definition?.collector ? definition.collector(boardData) : boardData.difference
        const instances = (list || []).map((instance: any) => {
            const value = definition?.value ? definition.value(instance) : instance.value
            return {
                ...instance,
                value: value || 1,
            };
        });
    
        const instancesByValue: Record<number|string, any> = {};
        for (const instance of instances) {
            if (!instancesByValue[instance.value]) {
                instancesByValue[instance.value] = [];
            }
            instancesByValue[instance.value].push(instance);
        }
    
        const hasNonconsecutive = definition?.negative ? definition.negative(boardData) : boardData.nonconsecutive === true;
        const hasDifferentNegative = Array.isArray(boardData.negative) && boardData.negative.includes('difference');
    
        if (hasNonconsecutive) {
            instancesByValue['1'] = instancesByValue['1'] || [];
        }
    
        const constraints = [] as Array<GeneralCellPairConstraint>;
        for (const value of Object.keys(instancesByValue)) {
            const instances = instancesByValue[value];
            const numValue = Number(value);
            const isAllowed = (value1: number, value2: number) => Math.abs(value1 - value2) === numValue;
            const negativePairsGenerator = (hasNonconsecutive && numValue === 1) || hasDifferentNegative ? orthogonalPairsGenerator : null;
            const params = {
                cellsPairs: instances.map(
                    (instance: any) => definition?.cells ? definition.cells(instance) : instance.cells,
                ),
            };
            const constraint = new GeneralCellPairConstraint(
                'Difference',
                `Difference of ${value}`,
                'kropki',
                isAllowed,
                negativePairsGenerator,
                board,
                params
            );
            constraints.push(constraint);
        }
        return constraints;
    });
    
    // Register a ratio constraint
    registerAggregateConstraint((board, boardData, boardDefinition) => {
        const definition = boardDefinition?.constraints?.ratio
        const list = definition?.collector ? definition.collector(boardData) : boardData.ratio
        const instances = (list || []).map((instance: any) => {
            const value = definition?.value ? definition.value(instance) : instance.value
            return {
                ...instance,
                value: value || 2,
            }
        });
    
        const instancesByValue: Record<string|number, any> = {};
        for (const instance of instances) {
            if (!instancesByValue[instance.value]) {
                instancesByValue[instance.value] = [];
            }
            instancesByValue[instance.value].push(instance);
        }
    
        const hasNegative = definition?.negative ? definition.negative(boardData) : Array.isArray(boardData.negative) && boardData.negative.includes('ratio');
        if (hasNegative) {
            instancesByValue['2'] = instancesByValue['2'] || [];
        }
    
        const constraints = [] as Array<GeneralCellPairConstraint>;
        for (const value of Object.keys(instancesByValue)) {
            const instances = instancesByValue[value];
            const numValue = Number(value);
            const isAllowed = (value1: number, value2: number) => value1 === numValue * value2 || value2 === numValue * value1;
            const negativePairsGenerator = hasNegative ? orthogonalPairsGenerator : null;
            const params = {
                cellsPairs: instances.map(
                    (instance: any) => definition?.cells ? definition.cells(instance) : instance.cells,
                ),
            };
            const constraint = new GeneralCellPairConstraint('Ratio', `Ratio of ${value}`, 'kropki', isAllowed, negativePairsGenerator, board, params);
            constraints.push(constraint);
        }
        return constraints;
    });
    
    // Register an XV constraint
    registerAggregateConstraint((board, boardData, boardDefinition) => {
        const definition = boardDefinition?.constraints?.xv
        const list = definition?.collector ? definition.collector(boardData) : boardData.xv as any[]
        const instances = (list || []).reduce(
            (newList: any[], instance: any) => {
                const value = definition?.value ? definition.value(instance) : instance.value
                if (!['x', 'X', 'v', 'V'].includes(value)) return newList

                return [
                    ...newList,
                    {
                        ...instance,
                        value: ['x', 'X'].includes(value) ? 10 : 5,
                    },
                ]
            },
            [] as any[],
        );
    
        const instancesByValue: Record<string|number, any> = {};
        for (const instance of instances) {
            if (!instancesByValue[instance.value]) {
                instancesByValue[instance.value] = [];
            }
            instancesByValue[instance.value].push(instance);
        }
    
        const hasNegative = definition?.negative ? definition.negative(boardData) : (Array.isArray(boardData.negative) && boardData.negative.includes('xv'));

        if (typeof hasNegative === 'boolean') {
            if (hasNegative) {
                instancesByValue['5'] = instancesByValue['5'] || [];
                instancesByValue['10'] = instancesByValue['10'] || [];
            }
        } else {
            if (hasNegative.x) {
                instancesByValue['10'] = instancesByValue['10'] || [];
            }
            if (hasNegative.v) {
                instancesByValue['5'] = instancesByValue['5'] || [];
            }
        }
    
        const constraints = [] as Array<GeneralCellPairConstraint>;
        for (const value of Object.keys(instancesByValue)) {
            const instances = instancesByValue[value];
            const numValue = Number(value);
            const isAllowed = (value1: number, value2: number) => value1 + value2 === numValue;
            const negativePairsGenerator = hasNegative ? orthogonalPairsGenerator : null;
            const params = {
                cellsPairs: instances.map(
                    (instance: any) => definition?.cells ? definition.cells(instance) : instance.cells
                ),
            };
            const constraint = new GeneralCellPairConstraint('XV', `XV`, 'sum', isAllowed, negativePairsGenerator, board, params);
            constraints.push(constraint);
        }
        return constraints;
    });

    // Register a sum constraint
    registerAggregateConstraint((board, boardData, boardDefinition) => {
        const definition = boardDefinition?.constraints?.sum
        const instances = (definition?.collector ? definition.collector(boardData) : boardData.sum) || []

        const instancesByValue: Record<string|number, any[]> = {};
        for (const instance of instances) {
            const value = definition?.value ? definition.value(instance) : instance.value

            instancesByValue[value] ||= []
            instancesByValue[value].push({
                ...instance,
                value,
            });
        }
    
        const hasNegative = definition?.negative ? definition.negative(boardData) : (Array.isArray(boardData.negative) && boardData.negative.includes('sum'));
    
        const constraints = [] as Array<GeneralCellPairConstraint>;
        for (const value of Object.keys(instancesByValue)) {
            const instances = instancesByValue[value];
            const numValue = Number(value);
            const isAllowed = (value1: number, value2: number) => value1 + value2 === numValue;
            const negativePairsGenerator = hasNegative ? orthogonalPairsGenerator : null;
            const params = {
                cellsPairs: instances.map(
                    (instance: any) => definition?.cells ? definition.cells(instance) : instance.cells,
                ),
            };
            const constraint = new GeneralCellPairConstraint('Sum', `Sum of ${value}`, 'sum', isAllowed, negativePairsGenerator, board, params);
            constraints.push(constraint);
        }
        return constraints;
    });    
}
