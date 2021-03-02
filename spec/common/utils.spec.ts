import * as utils from '../../src/common/utils';
import { Vector3 } from 'three';

describe('utils', function() {
	it('getExtension', () => {
        expect( () => { expect(utils.getExtension('test')); } ).toThrow(new Error(`Invalid filename: test, or no extension present.`));

        expect(utils.getExtension('test.tom')).toBe('tom');
        expect(utils.getExtension('pathTo/test.vol')).toBe('vol');
        const filename = 'pathTo with/ Spaces.andDots/test.vol';
        expect(utils.getExtension(filename)).toBe('vol');

        // No mutations.
        expect(filename).toEqual('pathTo with/ Spaces.andDots/test.vol');
	});
	
	it('removeExtension', () => {
        expect( () => { expect(utils.removeExtension('test')); } ).toThrow(new Error(`Invalid filename: test, or no extension present.`));

        expect(utils.removeExtension('test.tom')).toBe('test');
        expect(utils.removeExtension('pathTo/test.vol')).toBe('pathTo/test');
        const filename = 'pathTo with/ Spaces.andDots/te.st.vol';
        expect(utils.removeExtension(filename)).toBe('pathTo with/ Spaces.andDots/te.st');

        // No mutations.
        expect(filename).toEqual('pathTo with/ Spaces.andDots/te.st.vol');
    });

    it('isInteger', () => {
		expect(utils.isInteger(NaN)).toEqual(false);
        expect(utils.isInteger(Infinity)).toEqual(false);
        expect(utils.isInteger(-Infinity)).toEqual(false);
        expect(utils.isInteger(4.7)).toEqual(false);
        expect(utils.isInteger(0)).toEqual(true);
        expect(utils.isInteger(3)).toEqual(true);
        expect(utils.isInteger(-45)).toEqual(true);
	});
	
	it('isPositiveInteger', () => {
		expect(utils.isPositiveInteger(NaN)).toEqual(false);
        expect(utils.isPositiveInteger(Infinity)).toEqual(false);
        expect(utils.isPositiveInteger(-Infinity)).toEqual(false);
        expect(utils.isPositiveInteger(4.7)).toEqual(false);
        expect(utils.isPositiveInteger(0)).toEqual(false);
        expect(utils.isPositiveInteger(3)).toEqual(true);
        expect(utils.isPositiveInteger(-45)).toEqual(false);
	});
	
	it('isNonNegativeInteger', () => {
		expect(utils.isNonNegativeInteger(NaN)).toEqual(false);
        expect(utils.isNonNegativeInteger(Infinity)).toEqual(false);
        expect(utils.isNonNegativeInteger(-Infinity)).toEqual(false);
        expect(utils.isNonNegativeInteger(4.7)).toEqual(false);
        expect(utils.isNonNegativeInteger(0)).toEqual(true);
        expect(utils.isNonNegativeInteger(3)).toEqual(true);
        expect(utils.isNonNegativeInteger(-45)).toEqual(false);
	});
	
	it('isUint8', () => {
		expect(utils.isUint8(NaN)).toEqual(false);
		expect(utils.isUint8(Infinity)).toEqual(false);
        expect(utils.isUint8(-Infinity)).toEqual(false);
        expect(utils.isUint8(4.7)).toEqual(false);
        expect(utils.isUint8(0)).toEqual(true);
		expect(utils.isUint8(3)).toEqual(true);
		expect(utils.isUint8(200)).toEqual(true);
		expect(utils.isUint8(32948700)).toEqual(false);
        expect(utils.isUint8(-45)).toEqual(false);
	});

	it('isUint32', () => {
		expect(utils.isUint32(NaN)).toEqual(false);
		expect(utils.isUint32(Infinity)).toEqual(false);
        expect(utils.isUint32(-Infinity)).toEqual(false);
        expect(utils.isUint32(4.7)).toEqual(false);
        expect(utils.isUint32(0)).toEqual(true);
		expect(utils.isUint32(3)).toEqual(true);
		expect(utils.isUint32(200)).toEqual(true);
		expect(utils.isUint32(32948700)).toEqual(true);
        expect(utils.isUint32(-45)).toEqual(false);
	 });

	 it('isInt32', () => {
		expect(utils.isInt32(NaN)).toEqual(false);
		expect(utils.isInt32(Infinity)).toEqual(false);
        expect(utils.isInt32(-Infinity)).toEqual(false);
        expect(utils.isInt32(4.7)).toEqual(false);
        expect(utils.isInt32(0)).toEqual(true);
		expect(utils.isInt32(3)).toEqual(true);
		expect(utils.isInt32(200)).toEqual(true);
		expect(utils.isInt32(32948700)).toEqual(true);
        expect(utils.isInt32(-45)).toEqual(true);
	 });

	 it('isFloat32', () => {
		expect(utils.isFloat32(NaN)).toEqual(false);
		expect(utils.isFloat32(Infinity)).toEqual(false);
        expect(utils.isFloat32(-Infinity)).toEqual(false);
        expect(utils.isFloat32(4.7)).toEqual(true);
        expect(utils.isFloat32(0)).toEqual(true);
		expect(utils.isFloat32(3)).toEqual(true);
		expect(utils.isFloat32(200)).toEqual(true);
		expect(utils.isFloat32(32948700)).toEqual(true);
        expect(utils.isFloat32(-45)).toEqual(true);
	 });

	 it('isArray', () => {
		expect(utils.isArray(undefined)).toEqual(false);
		expect(utils.isArray(null)).toEqual(false);
		expect(utils.isArray(NaN)).toEqual(false);
		expect(utils.isArray(-45)).toEqual(false);
		expect(utils.isArray([])).toEqual(true);
		expect(utils.isArray(new Uint8Array(10))).toEqual(true);
		expect(utils.isArray([1, 2, 3, -4])).toEqual(true);
		expect(utils.isArray({})).toEqual(false);
	 });

	 it('isTypedArray', () => {
		expect(utils.isTypedArray(undefined)).toEqual(false);
		expect(utils.isTypedArray(null)).toEqual(false);
		expect(utils.isTypedArray(NaN)).toEqual(false);
		expect(utils.isTypedArray([])).toEqual(false);
		expect(utils.isTypedArray(new Uint8Array(10))).toEqual(true);
		expect(utils.isTypedArray(new Int32Array(10))).toEqual(true);
		expect(utils.isTypedArray(new Uint32Array(10))).toEqual(true);
		expect(utils.isTypedArray(new Float32Array(10))).toEqual(true);
		expect(utils.isTypedArray(new Float64Array(10))).toEqual(true);
	 });

    it('index3Dto1D', () => {
        const dim = new Vector3(24, 46, 21);
        const dimCopy = dim.clone();

		// Check for errors.
		// Bad index.
		const vector = new Vector3(2, 5, 12);
		vector.x = NaN;
		expect( () => { utils.index3Dto1D(vector, dim) } ).toThrow(new Error('Invalid index3D: [ NaN, 5, 12 ].'));
		vector.x = 2;
		vector.y = NaN;
		expect( () => { utils.index3Dto1D(vector, dim) } ).toThrow(new Error('Invalid index3D: [ 2, NaN, 12 ].'));
		vector.y = 5;
		vector.z = NaN;
		expect( () => { utils.index3Dto1D(vector, dim) } ).toThrow(new Error('Invalid index3D: [ 2, 5, NaN ].'));
		// Index is float.
		expect( () => { utils.index3Dto1D(new Vector3(2.3, 5, 12), dim) } ).toThrow(new Error('Invalid index3D: [ 2.3, 5, 12 ].'));
		expect( () => { utils.index3Dto1D(new Vector3(2, 5.1, 12), dim) } ).toThrow(new Error('Invalid index3D: [ 2, 5.1, 12 ].'));
		expect( () => { utils.index3Dto1D(new Vector3(2, 5, 12.4), dim) } ).toThrow(new Error('Invalid index3D: [ 2, 5, 12.4 ].'));
		// Index out of bounds.
		expect( () => { utils.index3Dto1D(new Vector3(-2, 5, 12), dim) } ).toThrow(new Error('Invalid index3D: [ -2, 5, 12 ] for buffer dimensions: [ 24, 46, 21 ].'));
		expect( () => { utils.index3Dto1D(new Vector3(24, 5, 12), dim) } ).toThrow(new Error('Invalid index3D: [ 24, 5, 12 ] for buffer dimensions: [ 24, 46, 21 ].'));
		expect( () => { utils.index3Dto1D(new Vector3(2, -5, 12), dim) } ).toThrow(new Error('Invalid index3D: [ 2, -5, 12 ] for buffer dimensions: [ 24, 46, 21 ].'));
		expect( () => { utils.index3Dto1D(new Vector3(2, 46, 12), dim) } ).toThrow(new Error('Invalid index3D: [ 2, 46, 12 ] for buffer dimensions: [ 24, 46, 21 ].'));
		expect( () => { utils.index3Dto1D(new Vector3(2, 5, -12), dim) } ).toThrow(new Error('Invalid index3D: [ 2, 5, -12 ] for buffer dimensions: [ 24, 46, 21 ].'));
		expect( () => { utils.index3Dto1D(new Vector3(2, 5, 21), dim) } ).toThrow(new Error('Invalid index3D: [ 2, 5, 21 ] for buffer dimensions: [ 24, 46, 21 ].')); 

		// Positive cases.
		expect(utils.index3Dto1D(new Vector3(0, 0, 0), dim)).toEqual(0);
		expect(utils.index3Dto1D(new Vector3(2, 5, 12), dim)).toEqual(13370);

		// No mutations.
		expect(dim).toEqual(dimCopy);
    });

    it('index1Dto3D', () => {
        const dim = new Vector3(24, 46, 21);
		const dimCopy = dim.clone();
		const output = new Vector3();

        // Check for errors.
		// Dimension is float.
        expect( () => { utils.index1Dto3D(2, new Vector3(24.2, 46, 21), output) } ).toThrow(new Error('Invalid dimension parameter: [ 24.2, 46, 21 ].'));
        expect( () => { utils.index1Dto3D(2, new Vector3(24, 46.3, 21), output) } ).toThrow(new Error('Invalid dimension parameter: [ 24, 46.3, 21 ].'));
        expect( () => { utils.index1Dto3D(2, new Vector3(24, 46, 21.7), output) } ).toThrow(new Error('Invalid dimension parameter: [ 24, 46, 21.7 ].'));
        // Bad index.
        expect( () => { utils.index1Dto3D(NaN, dim, output) } ).toThrow(new Error('Invalid index parameter: NaN.'));
        // Index is float.
        expect( () => { utils.index1Dto3D(4.3, dim, output) } ).toThrow(new Error('Invalid index parameter: 4.3.'));
        // Index out of range.
        expect( () => { utils.index1Dto3D(-2, dim, output) } ).toThrow(new Error('Attempting to access out of bounds index: -2 for dimensions: [ 24, 46, 21 ].'));
        expect( () => { utils.index1Dto3D(dim.x * dim.y * dim.z, dim, output) } ).toThrow(new Error('Attempting to access out of bounds index: 23184 for dimensions: [ 24, 46, 21 ].'));

        // Positive cases.
        expect(utils.index1Dto3D(0, dim, output)).toEqual(new Vector3(0, 0, 0));
        expect(utils.index1Dto3D(13370, dim, output)).toEqual(new Vector3(2, 5, 12));

        // No mutations.
        expect(dim).toEqual(dimCopy);
	});
	
	it('positionToIndex3D', () => {
        const dim = new Vector3(4, 5, 7);
		const dimCopy = dim.clone();
        expect(utils.positionToIndex3D(new Vector3(3.0, 4.52, -2.4), new Vector3(), dim)).toEqual(null);
        expect(utils.positionToIndex3D(new Vector3(3.0, 4.52, 2.4), new Vector3(), dim)).toEqual(new Vector3(3, 4, 2));
        const position = new Vector3(3.0, 4.52, 8.1);
        const positionClone = position.clone();
        expect(utils.positionToIndex3D(position, new Vector3(), dim)).toEqual(null);

        // No mutations.
        expect(dim).toEqual(dimCopy);
        expect(position).toEqual(positionClone);
	});
	
	it('index3DInBounds', () => {
        const dim = new Vector3(24, 46, 21);
        const dimCopy = dim.clone();

        const index = new Vector3(23, 4, 5);
        const indexCopy = index.clone();

        expect(utils.index3DInBounds(index, dim)).toBe(true);
        expect(utils.index3DInBounds(new Vector3(24, 4, 5), dim)).toBe(false);
        expect(utils.index3DInBounds(new Vector3(23, 46, 5), dim)).toBe(false);
        expect(utils.index3DInBounds(new Vector3(23, 4, 21), dim)).toBe(false);
        expect(utils.index3DInBounds(new Vector3(-1, 4, 5), dim)).toBe(false);
        expect(utils.index3DInBounds(new Vector3(23, -1, 5), dim)).toBe(false);
        expect(utils.index3DInBounds(new Vector3(23, 4, -1), dim)).toBe(false);

        // No mutations.
        expect(dim).toEqual(dimCopy);
        expect(index).toEqual(indexCopy);
    });

    // it('vector3ForIndex', () => {
    //     const data = Float32Array.from([3.5, 2.3, 0, -10000, -10000, -10000, -3.4, 23.5, -10]);
    //     const dataCopy = data.slice();

    //     expect(utils.vector3ForIndex(0, data)).toEqual(new Vector3(data[0], data[1], data[2]));
    //     expect(utils.vector3ForIndex(1, data)).toEqual(null);
    //     expect(utils.vector3ForIndex(2, data)).toEqual(new Vector3(data[6], data[7], data[8]));

    //     expect( () => { utils.vector3ForIndex(3, data) } ).toThrow(new Error('Index out of range: 3.'));
    //     expect( () => { utils.vector3ForIndex(-1, data) } ).toThrow(new Error('Index out of range: -1.'));

    //     // no mutations
    //     expect(data).toEqual(dataCopy);
    // });

    // it('convertNeighborsToEdges', () => {
        
	// });
	
	it('clamp', () => {
        expect(utils.clamp(0, 3, 4)).toBe(3);
        expect(utils.clamp(0, -3, 4)).toBe(0);
        expect(utils.clamp(-10, -3, 4)).toBe(-3);
        expect(utils.clamp(4.3, 3, 4)).toBe(4);
        expect( () => { utils.clamp(4.3, 4, 3) } ).toThrow(new Error('Invalid range for clamp: min 4, max 3.'));
    });
});