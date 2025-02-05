import type Board from "./board";
import { ConstraintResult } from "./constraints/constraint";
import { cellsKey, minValue, valueBit } from "./solve-utility";
import SumGroup from "./sum-group";

export default class SumCellsHelper {
    constructor(board: Board, cells: number[]) {
        this.groups = board.splitIntoGroups(cells).map(group => new SumGroup(board, group));
        this.cells = [...cells].sort((a, b) => a - b);
        this.cellsString = cellsKey('SumCellsHelper', this.cells, board.size);
    }

    groups: SumGroup[]
    cells: number[]
    cellsString: string

    init(board: Board, possibleSums: number[]) {
        if (possibleSums.length === 0) {
            return ConstraintResult.INVALID;
        }

        const sums = [...possibleSums].sort((a, b) => a - b);

        let minSum = 0;
        let maxSum = 0;
        let groupMinMax = [] as Array<{ group: any; groupMin: any; groupMax: any }>;
        for (let group of this.groups) {
            const [curMin, curMax] = group.minMaxSum(board);
            if (curMin === 0 || curMax === 0) {
                return ConstraintResult.INVALID;
            }

            minSum += curMin;
            maxSum += curMax;

            groupMinMax.push({ group: group, groupMin: curMin, groupMax: curMax });
        }

        const possibleSumMin = sums[0];
        const possibleSumMax = sums[sums.length - 1];
        if (minSum > possibleSumMax || maxSum < possibleSumMin) {
            return ConstraintResult.INVALID;
        }

        // Each group can increase from its min by the minDof
        // and decrease from its max by the maxDof
        let changed = false;
        const minDof = possibleSumMax - minSum;
        const maxDof = maxSum - possibleSumMin;

        for (const { group, groupMin, groupMax } of groupMinMax) {
            if (groupMin === groupMax) {
                continue;
            }

            const newGroupMin = Math.max(groupMin, groupMax - maxDof);
            const newGroupMax = Math.min(groupMax, groupMin + minDof);
            if (newGroupMin > groupMin || newGroupMax < groupMax) {
                const constraintResult = group.restrictMinMaxSum(board, newGroupMin, newGroupMax);
                if (constraintResult === ConstraintResult.INVALID) {
                    return ConstraintResult.INVALID;
                }

                if (constraintResult === ConstraintResult.CHANGED) {
                    changed = true;
                }
            }
        }
        return changed ? ConstraintResult.CHANGED : ConstraintResult.UNCHANGED;
    }

    logicStep(board: Board, possibleSums: number[], logicalStepDescription: null|string[]) {
        if (possibleSums.length === 0) {
            return ConstraintResult.INVALID;
        }

        const sums = [...possibleSums].sort((a, b) => a - b);

        let completedSum = 0;
        let numIncompleteGroups = 0;
        let minSum = 0;
        let maxSum = 0;
        let groupMinMax = [] as Array<{ group: any; groupMin: any; groupMax: any }>;
        for (let group of this.groups) {
            const [curMin, curMax] = group.minMaxSum(board);
            if (curMin === 0 || curMax === 0) {
                if (logicalStepDescription) {
                    logicalStepDescription.push(`${board.compactName(group.cells)} has no valid candidate combination.`);
                }
                return ConstraintResult.INVALID;
            }

            minSum += curMin;
            maxSum += curMax;

            if (curMin !== curMax) {
                numIncompleteGroups++;
            } else {
                completedSum += curMin;
            }

            groupMinMax.push({ group: group, groupMin: curMin, groupMax: curMax });
        }

        let possibleSumMin = sums[0];
        let possibleSumMax = sums[sums.length - 1];
        if (minSum > possibleSumMax || maxSum < possibleSumMin) {
            if (logicalStepDescription) {
                logicalStepDescription.push(`Sum is no longer possible (Between ${minSum} and ${maxSum}).`);
            }
            return ConstraintResult.INVALID;
        }

        if (numIncompleteGroups === 0) {
            // All groups are complete
            return ConstraintResult.UNCHANGED;
        }

        if (numIncompleteGroups === 1) {
            // One group left means it must exactly sum to whatever sum is remaining
            const { group, groupMin, groupMax } = groupMinMax.find(g => g.groupMin !== g.groupMax)!;
            const numCells = group.cells.length;

            // If the logical step description is desired, then track what the cells were before applying the sum range.
            let oldMasks = new Array(numCells).fill(0);
            for (let i = 0; i < numCells; i++) {
                const cell = group.cells[i];
                oldMasks[i] = board.cells[cell];
            }

            // Restrict the sum to desired values
            const validSums = sums.map(sum => sum - completedSum).filter(sum => sum >= groupMin && sum <= groupMax);
            let constraintResult = group.restrictSums(board, validSums);
            if (constraintResult === ConstraintResult.INVALID) {
                if (logicalStepDescription) {
                    logicalStepDescription.push(`${board.compactName(group.cells)} cannot sum to the desired value${sums.length !== 1 ? 's' : ''}.`);
                }
                return ConstraintResult.INVALID;
            }

            if (constraintResult === ConstraintResult.CHANGED) {
                let elims = [] as Array<any>;
                for (let i = 0; i < numCells; i++) {
                    const cell = group.cells[i];
                    let removedMask = oldMasks[i] & ~board.cells[cell];
                    while (removedMask !== 0) {
                        const value = minValue(removedMask);
                        removedMask ^= valueBit(value);
                        elims.push(board.candidateIndex(cell, value));
                    }
                }

                if (logicalStepDescription) {
                    logicalStepDescription.push(`Sum re-evaluated: ${board.describeElims(elims)}.`);
                }
                return ConstraintResult.CHANGED;
            }

            return ConstraintResult.UNCHANGED;
        }

        // Each group can increase from its min by the minDof
        // and decrease from its max by the maxDof
        const minDof = possibleSumMax - minSum;
        const maxDof = maxSum - possibleSumMin;

        const elims = [] as Array<any>;
        for (const { group, groupMin, groupMax } of groupMinMax) {
            if (groupMin === groupMax) {
                continue;
            }

            const newGroupMin = Math.max(groupMin, groupMax - maxDof);
            const newGroupMax = Math.min(groupMax, groupMin + minDof);
            if (newGroupMin > groupMin || newGroupMax < groupMax) {
                const numCells = group.cells.length;
                const oldMasks = new Array(numCells).fill(0);
                for (let i = 0; i < numCells; i++) {
                    const cell = group.cells[i];
                    oldMasks[i] = board.cells[cell];
                }

                const constraintResult = group.restrictMinMaxSum(board, newGroupMin, newGroupMax);
                if (constraintResult === ConstraintResult.INVALID) {
                    if (logicalStepDescription) {
                        logicalStepDescription.push(
                            `${board.compactName(group.cells)} cannot be restricted between ${newGroupMin} and ${newGroupMax}.`
                        );
                    }
                    return ConstraintResult.INVALID;
                }

                if (constraintResult === ConstraintResult.CHANGED) {
                    for (let i = 0; i < numCells; i++) {
                        const cell = group.cells[i];
                        let removedMask = oldMasks[i] & ~board.cells[cell];
                        while (removedMask !== 0) {
                            const value = minValue(removedMask);
                            removedMask ^= valueBit(value);
                            elims.push(board.candidateIndex(cell, value));
                        }
                    }
                }
            }
        }

        if (elims.length > 0) {
            if (logicalStepDescription) {
                logicalStepDescription.push(`Sum re-evaluated: ${board.describeElims(elims)}.`);
            }
            return ConstraintResult.CHANGED;
        }

        return ConstraintResult.UNCHANGED;
    }

    sumRange(board: Board) {
        let minSum = 0;
        let maxSum = 0;
        for (const group of this.groups) {
            const [groupMin, groupMax] = group.minMaxSum(board);
            minSum += groupMin;
            maxSum += groupMax;
        }
        return [minSum, maxSum];
    }

    possibleSums(board: Board) {
        let completedSum = 0;
        const incompleteGroupsSums = [] as number[][];
        for (const group of this.groups) {
            const possibleSums = group.possibleSums(board);
            if (possibleSums.length === 0) {
                return [];
            }

            if (possibleSums.length > 1) {
                incompleteGroupsSums.push(possibleSums);
            } else {
                completedSum += possibleSums[0];
            }
        }

        if (incompleteGroupsSums.length === 0) {
            return [completedSum];
        }

        // Limit exact results to 5 incomplete groups
        if (incompleteGroupsSums.length <= 5) {
            const sums = new Set() as Set<number>;
            for (const sum of SumCellsHelper.enumerateSums(incompleteGroupsSums)) {
                sums.add(sum + completedSum);
            }
            return Array.from(sums).sort((a, b) => a - b);
        }

        // Quick and dirty approximation
        let min = completedSum;
        let max = completedSum;
        for (const group of this.groups) {
            const [groupMin, groupMax] = group.minMaxSum(board);
            min += groupMin;
            max += groupMax;
        }
        return Array.from({ length: max - min + 1 }, (_, i) => min + i);
    }

    // Note the '*' after 'function', which makes this a generator function
    static *enumerateSums(groups: number[][], groupIndex = 0): any {
        if (groupIndex === groups.length) {
            yield 0;
        } else {
            const group = groups[groupIndex];
            for (let i = 0; i < group.length; i++) {
                const sum = group[i];
                const subSums = SumCellsHelper.enumerateSums(groups, groupIndex + 1);
                for (const subSum of subSums) {
                    yield sum + subSum;
                }
            }
        }
    }
}
