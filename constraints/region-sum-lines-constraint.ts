import Board, { type Region } from "../board";
import { registerConstraint } from "../constraint-builder";
import { cellName, minValue, valueBit } from "../solve-utility";
import { cellIndexFromAddress } from "../solve-worker";
import SumGroup from "../sum-group";
import Constraint, { ConstraintResult } from "./constraint";

class RegionSumLinesConstraint extends Constraint {
    constructor(board: Board, params: { cells: any[] }) {
        const cells = params.cells.map(cellAddress => cellIndexFromAddress(cellAddress, board.size));
        const specificName = `Region Sum Line at ${cellName(cells[0], board.size)}`;
        super(board, 'Region Sum Line', specificName);

        this.cells = cells;
        this.cellsSet = new Set(this.cells);
    }

    cells: number[]
    cellsSet: any
    segments?: Array<any>
    sumGroups?: SumGroup[]

    init(board: Board, isRepeat: boolean) {
        if (!isRepeat) {
            // Split cells into segments
            this.segments = [];
            let currentSegment = [] as Array<any>;
            let currentRegion: null|Region = null;
            for (const cell of this.cells) {
                const cellRegions = board.getRegionsForCell(cell, 'region');
                if (cellRegions.length === 0) {
                    // Ignore cells that are regionless
                    continue;
                }
                const cellRegion = cellRegions[0];
                if (currentRegion !== cellRegion) {
                    if (currentSegment.length > 0) {
                        this.segments.push(currentSegment);
                    }
                    currentSegment = [cell];
                    currentRegion = cellRegion;
                } else {
					currentSegment.push(cell);
				}
            }
            if (currentSegment.length > 0) {
                this.segments.push(currentSegment);
            }

            // If there is one or fewer segments, this constraint is useless
            if (this.segments.length <= 1) {
                return ConstraintResult.UNCHANGED;
            }

            // Create a sum helper for each segment
            this.sumGroups = [];
            for (const segment of this.segments) {
                const sumGroup = new SumGroup(board, segment);
                this.sumGroups.push(sumGroup);
            }
        }

        // Get all possible sums
        const possibleSums = this.possibleSums(board);
        if (possibleSums.length === 0) {
            return ConstraintResult.INVALID;
        }

        // Restrict all segements to the possible sums
        let changed = false;
        for (const sumHelper of (this.sumGroups || [])) {
            const restrictResult = sumHelper.restrictSums(board, possibleSums);
            if (restrictResult === ConstraintResult.INVALID) {
                return ConstraintResult.INVALID;
            }
            if (restrictResult === ConstraintResult.CHANGED) {
                changed = true;
            }
        }

		return changed ? ConstraintResult.CHANGED : ConstraintResult.UNCHANGED;
    }

    enforce(board: Board, cellIndex: number, value: number) {
		if (!this.cellsSet.has(cellIndex)) {
			return true;
		}

		if (!this.sumGroups) {
			return true;
		}

		const possibleSums = this.possibleSums(board);
		if (possibleSums.length === 0) {
			return false;
		}

		return true;
	}

    logicStep(board: Board, logicalStepDescription: string[]) {
		if (!this.sumGroups) {
			return ConstraintResult.UNCHANGED;
		}

		const possibleSums = this.possibleSums(board);
		if (possibleSums.length === 0) {
			if (logicalStepDescription) {
				logicalStepDescription.push('No possible sum works for all segments.');
			}
			return ConstraintResult.INVALID;
		}

		let origMasks: null|number[] = null;
		if (logicalStepDescription) {
			origMasks = this.cells.map(cell => board.cells[cell]);
		}

		let changed = false;
		for (const sumGroup of this.sumGroups) {
			const restrictResult = sumGroup.restrictSums(board, possibleSums);
			if (restrictResult === ConstraintResult.INVALID) {
				if (logicalStepDescription) {
					logicalStepDescription.push(`Cells ${board.compactName(sumGroup.cells)} cannot be restricted to the sum${possibleSums.length === 1 ? '' : 's'} ${possibleSums.join(',')}.`);
				}
				return ConstraintResult.INVALID;
			}
			if (restrictResult === ConstraintResult.CHANGED) {
				changed = true;
			}
		}

		if (changed && logicalStepDescription) {
			const elims = [] as Array<any>;
			for (let i = 0; i < this.cells.length; i++) {
				const cell = this.cells[i];
				const origMask = origMasks![i];
				const newMask = board.cells[cell];
				let removedMask = origMask & ~newMask;
				while (removedMask !== 0) {
					const value = minValue(removedMask);
					removedMask &= ~valueBit(value);

					const candidate = board.candidateIndex(cell, value);
					elims.push(candidate);
				}
			}

			logicalStepDescription.push(
                `Restricted to sum${possibleSums.length === 1 ? '' : 's'} ${possibleSums.join(',')} => ${board.describeElims(elims)}.`
            );
		}

		return changed ? ConstraintResult.CHANGED : ConstraintResult.UNCHANGED;
	}

    possibleSums(board: Board) {
        let sums = null as null|Set<any>;
        for (const sumGroup of (this.sumGroups || [])) {
            const possibleSums = sumGroup.possibleSums(board);
            if (possibleSums.length === 0) {
                return [];
            }

            if (sums === null) {
                sums = new Set(possibleSums);
            } else {
				sums = new Set(possibleSums.filter(x => sums!.has(x)));
            }
        }

        if (sums === null) {
            return [];
        }
        return Array.from(sums).sort((a, b) => a - b);
    }
}

export function register() {
    registerConstraint(
        'regionsumline',
        (board, params, definition) => {
            const lines = definition?.lines ? definition.lines(params) : params.lines
            return lines.map(
                (cells: any[]) => new RegionSumLinesConstraint(board, { cells })
            )
        },
    );
}
