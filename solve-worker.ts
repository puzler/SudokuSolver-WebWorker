import Board from './board'
import { buildConstraints } from './constraint-builder';
import registerAllConstraints from './constraint-registry';
import type {
    BoardDefinition,
    CandidatesList,
    CellDataParam,
} from './types'
export type {
    BoardDefinition,
    CellDataParam, 
    CandidatesList,
}

import {
    maskToString,
    minValue,
    valueBit,
    valuesList,
    valuesMask,
} from './solve-utility'

registerAllConstraints()
let eventCanceled = false;
let boardDefinition = {} as BoardDefinition;
const workerId = Math.floor(Math.random() * 100000)

addEventListener(
    'message',
    async function (e) {
        const data = e.data;

        switch (data.cmd) {
            case 'define':
                defineBoard(data);
                break;
            case 'solve':
                eventCanceled = false;
                solve(data);
                break;
            case 'count':
                eventCanceled = false;
                await countSolutions(data);
                break;
            case 'truecandidates':
                eventCanceled = false;
                await trueCandidates(data);
                break;
            case 'step':
                eventCanceled = false;
                await step(data);
                break;
            case 'logicalsolve':
                eventCanceled = false;
                await logicalSolve(data);
                break;
            case 'cancel':
                eventCanceled = true;
                break;
            default:
                postMessage({ result: 'unknown command' });
        }
    },
    false
);

export function cellIndexFromAddress(address: any, size: number) {
    if (boardDefinition.indexForAddress) {
        return boardDefinition.indexForAddress(address, size)
    }

	const regex = /r(\d+)c(\d+)/;
	const match = regex.exec(address.toLowerCase());
	if (!match) {
		throw new Error(`Invalid cell address: ${address}`);
	}

	const row = parseInt(match[1]) - 1;
	const col = parseInt(match[2]) - 1;
	return row * size + col;
}

function defineBoard(data: { definition: string }) {
    if (data.definition) {
        boardDefinition = JSON.parse(
            data.definition,
            (_, value) => {
                if (typeof value === 'object' && value.encodedFunc === true) {
                    return new Function(`return ${value.func}`)()
                }

                return value
            }
        )
    }
}

function solve(data: { board: any, options?: { random?: boolean } }) {
    const board = createBoard(data.board);
    if (!board) {
        postMessage({ result: 'invalid' });
    } else {
        const solution = board.findSolution(data.options || {}, () => eventCanceled);
        if (solution === null) {
            postMessage({ result: 'no solution' });
        } else if (solution instanceof Board) {
            const solutionValues = solution.getValueArray();
            postMessage({ result: 'solution', solution: solutionValues });
        } else if (solution.cancelled) {
            postMessage({ result: 'cancelled' });
        }
    }
};

async function countSolutions(data: { board: any, options?: { maxSolutions?: number } }) {
    const board = createBoard(data.board);
    if (!board) {
        postMessage({ result: 'invalid' });
    } else {
        const { maxSolutions = 0 } = data.options || {};
        const countResult = await board.countSolutions(
            maxSolutions,
            count => {
                postMessage({ result: 'count', count: count, complete: false });
            },
            () => eventCanceled
        );
        if (countResult.isCancelled) {
            postMessage({ result: 'count', count: countResult.numSolutions, complete: false, cancelled: true });
        } else {
            postMessage({ result: 'count', count: countResult.numSolutions, complete: true });
        }
    }
};

function expandCandidates(candidates?: number[], givenBit?: number) {
    if (!givenBit) {
        return candidates?.map(mask => valuesList(mask));
    }

    return candidates?.map(mask => {
        if (mask & givenBit) {
            return { given: true, value: minValue(mask) };
        }
        return valuesList(mask);
    });
}

async function trueCandidates(data: { board: any, options?: { maxSolutionsPerCandidate?: number } }) {
    const board = createBoard(data.board);
    if (!board) {
        postMessage({ result: 'invalid' });
    } else {
        const { maxSolutionsPerCandidate = 1 } = data.options || {};

        const trueCandidatesResult = await board.calcTrueCandidates(maxSolutionsPerCandidate, () => eventCanceled);
        if (trueCandidatesResult.invalid) {
            postMessage({ result: 'invalid' });
        } else if (trueCandidatesResult.cancelled) {
            postMessage({ result: 'cancelled' });
        } else {
            const { candidates, counts } = trueCandidatesResult;
            const expandedCandidates = expandCandidates(candidates);
            postMessage({ result: 'truecandidates', candidates: expandedCandidates, counts: counts });
        }
    }
};

// Compares the initial candidates in the provided data with the final imported board.
function candidatesDiffer(board: Board, data: { board: any }) {
    const size = board.size;
    const dataGrid = gridFor(data.board)
    for (let i = 0; i < size; i++) {
        for (let j = 0; j < size; j++) {
            const cellIndex = i * size + j;
            const cellMask = board.cells[cellIndex] & board.allValues;
            const dataCell = dataGrid[i][j];

            const cellDataParams = { cell: dataCell, row: i, column: j, boardData: data.board }
            const cellValue  = valueFor(cellDataParams)

            let dataCellMask = 0;
            if (cellValue) {
                dataCellMask = valueBit(cellValue);
            } else {
                const givenPencilMarks = givenMarksFor(cellDataParams)
                const centerPencilMarks = centerMarksFor(cellDataParams)
                const haveGivenPencilmarks = (givenPencilMarks?.length || 0) > 0;
                const haveCenterPencilmarks = (centerPencilMarks?.length  || 0) > 0;

                if (haveGivenPencilmarks && haveCenterPencilmarks) {
                    dataCellMask = valuesMask(givenPencilMarks!.filter(value => centerPencilMarks!.includes(value)));
                } else if (haveGivenPencilmarks) {
                    dataCellMask = valuesMask(givenPencilMarks!);
                } else if (haveCenterPencilmarks) {
                    dataCellMask = valuesMask(centerPencilMarks!);
                }
            }

            if (cellMask !== dataCellMask) {
                return true;
            }
        }
    }

    return false;
}

async function step(data: { board: any }) {
    const board = createBoard(data.board, true);
    if (!board) {
        postMessage({ result: 'step', desc: 'Board is invalid!', invalid: true, changed: false });
        return;
    }

    if (candidatesDiffer(board, data)) {
        const expandedCandidates = expandCandidates(board.cells, board.givenBit);
        postMessage({ result: 'step', desc: 'Initial Candidates', candidates: expandedCandidates, invalid: false, changed: true });
        return;
    }

    // Perform a single step
    const stepResult = await board.logicalStep(() => eventCanceled);
    if (stepResult.cancelled) {
        postMessage({ result: 'cancelled' });
        return;
    }

    if (stepResult.unchanged) {
        if (board.nonGivenCount === 0) {
            postMessage({ result: 'step', desc: 'Solved!' });
        } else {
            postMessage({ result: 'step', desc: 'No logical steps found.' });
        }
        return;
    }

    const expandedCandidates = expandCandidates(board.cells, board.givenBit);
    postMessage({ result: 'step', desc: stepResult.desc, candidates: expandedCandidates, invalid: stepResult.invalid, changed: stepResult.changed });
}

async function logicalSolve(data: { board: any }) {
    const board = createBoard(data.board, true);
    if (!board) {
        postMessage({ result: 'logicalsolve', desc: ['Board is invalid!'], invalid: true, changed: false });
        return;
    }

    const solveResult = await board.logicalSolve(() => eventCanceled);
    if (solveResult.cancelled) {
        postMessage({ result: 'cancelled' });
        return;
    }

    let desc = solveResult.desc;
    if (board.nonGivenCount === 0) {
        desc.push('Solved!');
    } else if (solveResult.invalid) {
        desc.push('Board is invalid!');
    } else {
        desc.push('No logical steps found.');
    }

    const expandedCandidates = expandCandidates(board.cells, board.givenBit);
    postMessage({ result: 'logicalsolve', desc, candidates: expandedCandidates, invalid: solveResult.invalid, changed: solveResult.changed });
};

function gridFor(boardData: any) {
    if (boardDefinition.grid?.cells) {
        const grid = boardDefinition.grid.cells(boardData)
        return grid
    }

    return boardData.grid
}

function givenMarksFor(cellParams: CellDataParam): undefined|null|Array<number> {
    if (boardDefinition.grid?.givenPencilMarks) {
        return boardDefinition.grid.givenPencilMarks(cellParams)
    }

    return cellParams.cell.givenPencilMarks
}

function centerMarksFor(cellParams: CellDataParam): undefined|null|Array<number> {
    if (boardDefinition.grid?.centerPencilMarks) {
        return boardDefinition.grid.centerPencilMarks(cellParams)
    }

    return cellParams.cell.centerPencilMarks
}

function valueFor(cellParams: CellDataParam): null|undefined|number {
    if (boardDefinition.grid?.value) {
        return boardDefinition.grid.value(cellParams)
    }

    return cellParams.cell.value
}

function givenFor(cellParams: CellDataParam): null|undefined|boolean {
    if (boardDefinition.grid?.cellIsGiven) {
        return boardDefinition.grid.cellIsGiven(cellParams)
    }

    return cellParams.cell.given
}

function createBoard(boardData: any, keepPencilMarks = false) {
    const size = boardData.size;
    const board = new Board(size);
    const boardGrid = gridFor(boardData)

    // Apply default regions
    applyDefaultRegions(boardGrid, size);

    // Add regions

    // Rows
    for (let row = 0; row < size; row++) {
        const rowCells = Array.from({ length: size }, (_, i) => board.cellIndex(row, i));
        board.addRegion(`Row ${row + 1}`, rowCells, 'row');
    }

    // Columns
    for (let col = 0; col < size; col++) {
        const colCells = Array.from({ length: size }, (_, i) => board.cellIndex(i, col));
        board.addRegion(`Col ${col + 1}`, colCells, 'col');
    }

    // Regions
    const uniqueRegions = new Map();
    for (let row = 0; row < size; row++) {
        for (let col = 0; col < size; col++) {
            const region = boardGrid[row][col].region;
            if (region >= 0) {
                const regionKey = (region + 1).toString();
                if (!uniqueRegions.has(regionKey)) {
                    uniqueRegions.set(regionKey, []);
                }
                uniqueRegions.get(regionKey).push(board.cellIndex(row, col));
            }
        }
    }
    for (const regionKey of uniqueRegions.keys()) {
        const region = uniqueRegions.get(regionKey);
        if (region.length == size) {
            board.addRegion(`Region ${regionKey}`, region, 'region');
        } else {
            return null
        }
    }

    // Add a weak link between all candidates within the same cell
    for (let cell = 0; cell < size * size; cell++) {
        for (let value1 = 1; value1 < size; value1++) {
            const cell1Candidate = board.candidateIndex(cell, value1);
            for (let value2 = value1 + 1; value2 <= size; value2++) {
                const cell2Candidate = board.candidateIndex(cell, value2);
                board.addWeakLink(cell1Candidate, cell2Candidate);
            }
        }
    }

    // Add constraints
    if (!buildConstraints(boardData, board, boardDefinition)) {
        return null;
    }

    // At this point, all weak links should be added

    // Set the givens
    for (let i = 0; i < size; i++) {
        for (let j = 0; j < size; j++) {
            const srcCell = boardGrid[i][j];
            const cellDataParam = { cell: srcCell, row: i, column: j, boardData }

            const givenPencilMarks = givenMarksFor(cellDataParam)
            const centerPencilMarks = centerMarksFor(cellDataParam)
            const cellValue = valueFor(cellDataParam)
            const cellIsGiven = givenFor(cellDataParam)

            const haveGivenPencilmarks = (givenPencilMarks?.length || 0) > 0
            const haveCenterPencilmarks = (centerPencilMarks?.length || 0) > 0

            const cellIndex = board.cellIndex(i, j);
            if (keepPencilMarks) {
                if (cellValue) {
                    if (!board.setAsGiven(cellIndex, cellValue)) {
                        return null;
                    }
                } else if (haveGivenPencilmarks && haveCenterPencilmarks) {
                    const pencilMarks = givenPencilMarks!.filter(value => centerPencilMarks!.includes(value));
                    if (!board.applyGivenPencilMarks(cellIndex, pencilMarks)) {
                        return null;
                    }
                } else if (haveGivenPencilmarks) {
                    if (!board.applyGivenPencilMarks(cellIndex, givenPencilMarks!)) {
                        return null;
                    }
                } else if (haveCenterPencilmarks) {
                    if (!board.applyGivenPencilMarks(cellIndex, centerPencilMarks!)) {
                        return null;
                    }
                }
            } else {
                 if (cellIsGiven && cellValue) {
                     if (!board.setAsGiven(cellIndex, cellValue)) {
                         return null;
                     }
                 } else if (haveGivenPencilmarks) {
                     if (!board.applyGivenPencilMarks(cellIndex, givenPencilMarks!)) {
                         return null;
                     }
                 }
            }
        }
    }

    // Clean up any naked singles which are alreay set as given
    const newNakedSingles = [] as Array<any>;
    for (const cellIndex of board.nakedSingles) {
        if (!board.isGiven(cellIndex)) {
            newNakedSingles.push(cellIndex);
        }
    }
    board.nakedSingles = newNakedSingles;

    return board;
};

function applyDefaultRegions(boardGrid: any, size: number) {
    const regionSizes = {} as { w?: number; h?: number };
    for (let h = 1; h * h <= size; h++) {
        if (size % h === 0) {
            regionSizes.w = size / h;
            regionSizes.h = h;
        }
    }

    for (let row = 0; row < size; row++) {
        for (let col = 0; col < size; col++) {
			const cell = boardGrid[row][col];
			if (cell.region === undefined) {
				cell.region = Math.floor(row / regionSizes.h!) * regionSizes.h! + Math.floor(col / regionSizes.w!);
			}
		}
    }
};