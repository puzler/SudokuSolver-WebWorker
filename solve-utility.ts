import type Board from "./board";

// Count the number of set bits in an integer
export function popcount(x: number) {
    x -= (x >> 1) & 0x55555555;
    x = (x & 0x33333333) + ((x >> 2) & 0x33333333);
    x = (x + (x >> 4)) & 0x0f0f0f0f;
    x += x >> 8;
    x += x >> 16;
    return x & 0x0000003f;
}

// Count the number of trailing zeros in an integer
export function ctz(x: number) {
    return popcount((x & -x) - 1);
}

// Computes the bitmask with all values set
export function allValues(size: number) {
	return (1 << size) - 1;
}

// Computes the bitmask with a specific value set
export function valueBit(value: number) {
	return 1 << (value - 1);
}

// Get the value of the first set bit
export function minValue(bits: number) {
	return ctz(bits) + 1;
}

// Get the value of the last set bit
export function maxValue(bits: number) {
	return 32 - Math.clz32(bits);
}

// Get if a value is set
export function hasValue(bits: number, value: number) {
	return (bits & valueBit(value)) !== 0;
}

// Get the value of a randomly set bit
export function randomValue(bits: number) {
	if (bits === 0) {
		return 0;
	}

	const numValues = popcount(bits);
	let valueIndex = Math.floor(Math.random() * numValues);
	let curBits = bits;
	while (curBits !== 0) {
		const value = minValue(curBits);
		if (valueIndex === 0) {
			return value;
		}
		curBits ^= valueBit(value);
		valueIndex--;
	}
	return 0;
}

export function valuesMask(values: number[]) {
	return values.reduce((mask, value) => mask | valueBit(value), 0);
}

export function valuesList(mask: number) {
	const values = [] as Array<number>;
	while (mask !== 0) {
		const value = minValue(mask);
		values.push(value);
		mask ^= valueBit(value);
	}
	return values;
}

export function binomialCoefficient(n: number, k: number) {
	if (k < 0 || k > n) {
		return 0;
	}

	if (k === 0 || k === n) {
		return 1;
	}

	k = Math.min(k, n - k);

	let result = 1;
	for (let i = 0; i < k; i++) {
		result *= n - i;
		result /= i + 1;
	}

	return result;
}

export function* combinations(array: any[], size: number) {
    function* combine(start: number, prefix: any[]): any {
        if (prefix.length === size) {
            yield prefix;
        } else {
            for (let i = start; i < array.length; i++) {
                yield* combine(i + 1, [...prefix, array[i]]);
            }
        }
    }
    yield* combine(0, []);
};

export function* permutations(array: any[]) {
    function* permute(list: any[], i: number): any {
        if (i + 1 === list.length) {
            yield list;
        } else {
            for (let j = i; j < list.length; j++) {
                [list[i], list[j]] = [list[j], list[i]];
                yield* permute(Array.from(list), i + 1);
                [list[i], list[j]] = [list[j], list[i]];
            }
        }
    }
    yield* permute(Array.from(array), 0);
};

// Helper for memo keys
export function cellsKey(prefix: any, cells: number[], size: number) {
	return prefix + appendCellNames(cells, size);
}

export function appendInts(ints: number[]): string {
	return ints.map(i => '|' + i).join('');
}

export function appendCellNames(cells: number[], size: number): string {
	return cells.map(cell => '|' + cellName(cell, size)).join('');
}

export function maskToString(mask: number, size: number): string {
	return valuesList(mask).join(size >= 10 ? ',' : '');
}

export function appendCellValueKey(board: Board, cells: number[]) {
	let builder = '';
	cells.forEach(cellIndex => {
		const mask = board.cells[cellIndex];
		builder += (board.isGivenMask(mask) ? '|s' : '|') + (mask & ~board.givenBit).toString(16);
	});
	return builder;
}

export function cellName (cellIndex: number, size: number) {
    const row = Math.floor(cellIndex / size);
    const col = cellIndex % size;
    return `R${row + 1}C${col + 1}`;
};

export function sequenceEqual(arr1: any[], arr2: any[]) {
    if (arr1.length !== arr2.length) {
        return false;
    }

    return arr1.every((value, index) => value === arr2[index]);
}

// Assumes arr is sorted
export function removeDuplicates(arr: any[]) {
    if (!arr.length) {
        return arr;
    }
    let j = 0;
    for (let i = 1; i < arr.length; i++) {
        if (arr[i] !== arr[j]) {
            j++;
            arr[j] = arr[i];
        }
    }
    return arr.slice(0, j + 1);
}
