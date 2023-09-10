import type Board from "../board";
import { registerAggregateConstraint } from "../constraint-builder";
import { cellName, hasValue, maskToString, popcount, valueBit, valuesList } from "../solve-utility";
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

    logicStep(board: Board, logicStepDescription: null|string[]) {
        for (let [cell1, cell2] of this.cellPairs) {
            if (board.isGiven(cell1)) continue
            if (board.isGiven(cell2)) continue

            let newCell1Mask = board.givenBit
            let newCell2Mask = board.givenBit
            let pairMustContain = null as null|number
            for (let value1 = 1; value1 <= board.size; value1 += 1) {
                if (!hasValue(board.cells[cell1], value1)) continue
                const candidate1 = board.candidateIndex(cell1, value1)
                for (let value2 = 1; value2 <= board.size; value2 += 1) {
                    if (!hasValue(board.cells[cell2], value2)) continue
                    const candidate2 = board.candidateIndex(cell2, value2)
                    if (board.isWeakLink(candidate1, candidate2)) continue
                    if (!this.isPairAllowed(value1, value2)) continue

                    if (pairMustContain === null) pairMustContain = this.allValues

                    pairMustContain! &= valueBit(value1) | valueBit(value2)
                    newCell1Mask |= valueBit(value1)
                    newCell2Mask |= valueBit(value2)
                }
            }

            const clearedValues = Array.from({ length: 2 }, () => 0)
            for (let i = 0; i < 2; i += 1) {
                const cell = i === 0 ? cell1 : cell2
                const clearMask = i === 0 ? ~newCell1Mask : ~newCell2Mask
                if ((board.cells[cell] & clearMask) === 0) continue

                const clearedCellValues = board.cells[cell] & clearMask
                const result = board.clearCellMask(cell, clearMask)
                if (result === ConstraintResult.INVALID) {
                    logicStepDescription?.push(
                    `${cellName(cell, board.size)} has no remaining values that satisfy the ${this.constraintName} constraint. Board is invalid!`
                    )
                    return ConstraintResult.INVALID
                }

                if (result === ConstraintResult.CHANGED) {
                    clearedValues[i] = clearedCellValues
                }
            }
            if (clearedValues.some((mask) => mask !== 0)) {
                const removedValuesStr = clearedValues.reduce(
                    (strs, removedMask, cellIndex) => {
                        if (removedMask === 0) return strs
                        return [
                            ...strs,
                            `${maskToString(removedMask, board.size)} from ${cellName(cellIndex === 0 ? cell1 : cell2, board.size)}`,
                        ]
                    },
                    [] as string[],
                ).join(', ')

                logicStepDescription?.push(
                    `${this.constraintName} at ${cellName(cell1, board.size)},${cellName(cell2, board.size)} removed values ${removedValuesStr}`
                )

                return ConstraintResult.CHANGED
            }

            if (pairMustContain === null) {
                logicStepDescription?.push(`${this.constraintName} at ${cellName(cell1, board.size)},${cellName(cell2, board.size)} has no valid pairs. Board is invalid!`)
                return ConstraintResult.INVALID
            }

            const requiredValueCount = popcount(pairMustContain & ~board.givenBit)
            if (requiredValueCount === 0) continue
            if (requiredValueCount == 2) {
                const cellsMask = board.cells[cell1] | board.cells[cell2]
                const clearMask = ~pairMustContain & ~board.givenBit
                if ((clearMask & cellsMask) === 0) continue
                logicStepDescription?.push(
                    `${this.constraintName} at ${cellName(cell1, board.size)},${cellName(cell2, board.size)} must be exactly ${maskToString(pairMustContain, board.size)}`
                )

                const results = [
                    board.keepCellMask(cell1, pairMustContain),
                    board.keepCellMask(cell2, pairMustContain),
                ]

                const invalidIndex = results.indexOf(ConstraintResult.INVALID)
                if (invalidIndex >= 0) {
                    const invalidCell = invalidIndex === 0 ? cell1 : cell2
                    logicStepDescription?.push(
                        `, ${cellName(invalidCell, board.size)} has no valid candidates. Board is invalid!`
                    )
                    return ConstraintResult.INVALID
                }

                if (results.some((res) => res === ConstraintResult.CHANGED)) {
                    return ConstraintResult.CHANGED
                }
            }

            const cell1Seen = board.seenCells(cell1)
            const cell2Seen = new Set(board.seenCells(cell2))

            const seenByBoth = cell1Seen.filter(
                (cell) => cell2Seen.has(cell)
            )
            if (seenByBoth.length === 0) continue

            const seenCellMasks = seenByBoth.reduce((mask, cell) => mask | board.cells[cell], 0)
            if ((seenCellMasks & pairMustContain) === 0) continue

            logicStepDescription?.push(
                `${this.constraintName} at ${cellName(cell1, board.size)},${cellName(cell2, board.size)} must contain ${maskToString(pairMustContain, board.size)}, which removes that value from any cells seen by the full pair`,
            )

            const results = seenByBoth.map(
                (cell) => board.clearCellMask(cell, pairMustContain!),
            )

            const invalidIndex = results.indexOf(ConstraintResult.INVALID)
            if (invalidIndex >= 0) {
                logicStepDescription?.push(
                    `, ${cellName(seenByBoth[invalidIndex], board.size)} has no more candidates. Board is invalid!`,
                )
                return ConstraintResult.INVALID
            }

            if (results.some((res) => res === ConstraintResult.CHANGED)) {
                return ConstraintResult.CHANGED
            }
        }

        return ConstraintResult.UNCHANGED
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

            const negativeValue = typeof hasNegative === 'boolean' ? hasNegative : hasNegative[value === '10' ? 'x' : 'v']
            const negativePairsGenerator = negativeValue ? orthogonalPairsGenerator : null;

            const params = {
                cellsPairs: instances.map(
                    (instance: any) => definition?.cells ? definition.cells(instance) : instance.cells
                ),
            };
            const constraint = new GeneralCellPairConstraint(
                'XV',
                `XV`,
                'sum',
                isAllowed,
                negativePairsGenerator,
                board,
                params,
            );
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
