import * as kernels from '../../src/common/kernels';

describe('kernels', () => {

	function sum(array: Float32Array) {
		return array.reduce((total: number, num: number) => {
			return total + num;
		}, 0);
	}

	it('creates a gauss kernel', () => {
		// Check errors.
		expect(() => kernels.makeG0Kernel(0)).toThrow(new Error('Invalid sigma: 0, must be larger than 0.'));

		// Crease kernel.
		const g0ExpectedValue = [ 0.00017751968698576093, 0.0158847663551569, 0.22146297991275787, 0.5249494910240173, 0.22146297991275787, 0.0158847663551569, 0.00017751968698576093 ];
		const g0 = kernels.makeG0Kernel(0.7);
		expect(g0.length).toEqual(g0ExpectedValue.length);
		for (let i = 0; i < g0.length; i++) {
			expect(g0[i]).toEqual(g0ExpectedValue[i]);
		}
		expect(sum(g0)).toBeCloseTo(1);
	});

	it('creates the first deriv gauss kernel', () => {
		// Check errors.
		expect(() => kernels.makeG0Kernel(0)).toThrow(new Error('Invalid sigma: 0, must be larger than 0.'));

		// Crease kernel.
		const g1ExpectedValue = [ -0.0009684491087682545, -0.05640452355146408, -0.3842204809188843, 0, 0.3842204809188843, 0.05640452355146408, 0.0009684491087682545 ];
		const g1 = kernels.makeG1Kernel(0.7);
		expect(g1.length).toEqual(g1ExpectedValue.length);
		for (let i = 0; i < g1.length; i++) {
			expect(g1[i]).toEqual(g1ExpectedValue[i]);
		}
		expect(sum(g1)).toEqual(0);
	});

	it('creates the second deriv gauss kernel', () => {
		// Check errors.
		expect(() => kernels.makeG0Kernel(0)).toThrow(new Error('Invalid sigma: 0, must be larger than 0.'));

		// Crease kernel.
		const g2ExpectedValue = [ 0.004941066727042198, 0.17069047689437866, 0.2749740183353424, -0.9012110829353333, 0.2749740183353424, 0.17069047689437866, 0.004941066727042198 ];
		const g2 = kernels.makeG2Kernel(0.7);
		expect(g2.length).toEqual(g2ExpectedValue.length);
		for (let i = 0; i < g2.length; i++) {
			expect(g2[i]).toEqual(g2ExpectedValue[i]);
		}
	});

});