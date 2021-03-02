// import * as fs from 'fs';
// import GPUHelper from '../src/common/GPUHelper';
// import TextureMap from '../src/texturing/TextureMap';
// import { Bounds2 } from '../src/common/types';
// import { Vector3, Vector2 } from 'three';
// import { DEVICE_NUM } from '../src/common/Defaults';
// import { nullValForType } from '../src/common/utils';
// import { writeBin, writeTom } from '../src/common/io';

// const DATA_PATH = 'spec/data/';
// const OUTPUT_PATH = 'spec/data/temp/';
// const TEST_TRI_FILENAME = 'TestTri';

// let gpuHelperTestTri: GPUHelper;
// let textureMapTestTri: TextureMap;

// const fileParamsTestTri = {
// 	FILENAME: TEST_TRI_FILENAME,
// 	DIMENSIONS: new Vector3(6, 6, 6),
// 	DATA_PATH,
// 	OUTPUT_PATH,
// };
// const texturingParams = {
// 	SCALE: 10,
// 	PADDING: new Vector2(10, 10),
// 	Z_OFFSET: 0,
// 	CURVATURE_SCALING_FACTOR: 3000,
// 	TRIANGLE_SEARCH_RADIUS: 2,
// 	STRAIN_CLIP_VAL: 0.1,
// }

// describe('texturing', () => {

// 	beforeAll(() => {
// 		// Make temp directory if needed.
// 		addDirectoryIfNeeded(OUTPUT_PATH);

// 		// Save test files.
// 		const testTriTomData = new Uint8Array(fileParamsTestTri.DIMENSIONS.x * fileParamsTestTri.DIMENSIONS.y * fileParamsTestTri.DIMENSIONS.z);
// 		const LAYER_SIZE = fileParamsTestTri.DIMENSIONS.x * fileParamsTestTri.DIMENSIONS.y;
// 		for (let i = 0; i < testTriTomData.length; i++) {
// 			testTriTomData[i] = Math.floor(i % (LAYER_SIZE)) * LAYER_SIZE; // 0 through 6 * 6 * 6 = 216
// 		}
// 		const testTri2D = new Float32Array([6.53, 53.9, 8.34, 54.1, 7.98, 55.8]);
// 		const testTri3D = new Float32Array([2.67, 2.1, 1.98, 4.35, 4.89, 2.23, 3.56, 4.00, 3.65]);
// 		const a = new Vector3(testTri3D[0], testTri3D[1], testTri3D[2]);
// 		const b = new Vector3(testTri3D[3], testTri3D[4], testTri3D[5]);
// 		const c = new Vector3(testTri3D[6], testTri3D[7], testTri3D[8]);
// 		const normal = (a.sub(b).cross(c.sub(b))).normalize();
// 		const testTriNormals3D = new Float32Array(normal.toArray());
// 		const testTriMeshNumbers = new Int32Array([0, 0, 0]);
// 		const testTriMeshNeighbors = new Int32Array([1, 2, 0, 2, 0, 1]);
// 		writeTom(fileParamsTestTri.DATA_PATH, fileParamsTestTri.FILENAME, testTriTomData, fileParamsTestTri.DIMENSIONS);
// 		writeBin(fileParamsTestTri.OUTPUT_PATH, fileParamsTestTri.FILENAME + '_grown_pts2D', testTri2D, 2, true);
// 		writeBin(fileParamsTestTri.OUTPUT_PATH, fileParamsTestTri.FILENAME + '_grown_pts3D', testTri3D, 3, true);
// 		writeBin(fileParamsTestTri.OUTPUT_PATH, fileParamsTestTri.FILENAME + '_grown_normals3D', testTriNormals3D, 3, true);
// 		writeBin(fileParamsTestTri.OUTPUT_PATH, fileParamsTestTri.FILENAME + '_grown_meshNumbers', testTriMeshNumbers, 1, true);
// 		writeBin(fileParamsTestTri.OUTPUT_PATH, fileParamsTestTri.FILENAME + '_grown_neighbors', testTriMeshNeighbors, 2, true);

// 		// Init gpuHelper.
// 		gpuHelperTestTri = new GPUHelper(DEVICE_NUM);
// 		textureMapTestTri = new TextureMap(gpuHelperTestTri, fileParamsTestTri, texturingParams);
// 	});

// 	beforeEach(() => {
// 		textureMapTestTri.clearCache();
// 	});

// 	afterAll(() => {
// 		gpuHelperTestTri.destroy();

// 		// Delete files.
// 		fs.unlinkSync(`${fileParamsTestTri.OUTPUT_PATH}${fileParamsTestTri.FILENAME}_grown_pts2D.bin`);
// 		fs.unlinkSync(`${fileParamsTestTri.OUTPUT_PATH}${fileParamsTestTri.FILENAME}_grown_pts3D.bin`);
// 		fs.unlinkSync(`${fileParamsTestTri.OUTPUT_PATH}${fileParamsTestTri.FILENAME}_grown_normals3D.bin`);
// 		fs.unlinkSync(`${fileParamsTestTri.OUTPUT_PATH}${fileParamsTestTri.FILENAME}_grown_meshNumbers.bin`);
// 		fs.unlinkSync(`${fileParamsTestTri.OUTPUT_PATH}${fileParamsTestTri.FILENAME}_Mesh0_0_offset.bmp`);
// 	});

// 	it('calcs bounds', () => {
// 		const padding = new Vector2(0, 0);
// 		const allBounds = textureMapTestTri.calcAllBounds(padding);
// 		expect(allBounds.length).toEqual(1);
// 		const bounds = allBounds[0];
// 		expect(bounds).not.toBe(null);
// 		const { min, max } = bounds as Bounds2;
// 		expect(min.equals(new Vector2(6,53))).toBe(true);
// 		expect(max.equals(new Vector2(8,55))).toBe(true);
// 		// Calc bounds using an alternate route.
// 		const bounds2 = textureMapTestTri.calcBounds(0, padding) as Bounds2;
// 		expect(min.equals(bounds2.min)).toBe(true);
// 		expect(max.equals(bounds2.max)).toBe(true);
// 	});

// 	it('calcs bounds with padding', () => {
// 		const padding = new Vector2(10, 20);
// 		const allBounds = textureMapTestTri.calcAllBounds(padding);
// 		expect(allBounds.length).toEqual(1);
// 		const bounds = allBounds[0];
// 		expect(bounds).not.toBe(null);
// 		const { min, max } = bounds as Bounds2;
// 		expect(min.equals(new Vector2(-4,33))).toBe(true);
// 		expect(max.equals(new Vector2(18,75))).toBe(true);
// 		// Calc bounds using an alternate route.
// 		const bounds2 = textureMapTestTri.calcBounds(0, padding) as Bounds2;
// 		expect(min.equals(bounds2.min)).toBe(true);
// 		expect(max.equals(bounds2.max)).toBe(true);
// 	});

// 	it('hashes points on grid without padding', () => {
// 		const params = {...texturingParams, PADDING: new Vector2(0, 0)};
// 		const bounds = textureMapTestTri.calcAllBounds(params.PADDING)[0] as Bounds2;
// 		const hashGridSize = TextureMap.calcHashGridSize(bounds);
// 		textureMapTestTri.saveGreyscaleTexture(fileParamsTestTri, params, 0, false);

// 		// Test that points are hashed to grid correctly.
// 		const grid2D = new Int32Array(hashGridSize.x * hashGridSize.y);
// 		gpuHelperTestTri.copyDataFromGPUBuffer('grid2D', grid2D);
// 		for (let i = 0; i < grid2D.length; i++) {
// 			if (i === 0) {
// 				expect(grid2D[i]).toEqual(0);
// 			} else if (i === 5) {
// 				expect(grid2D[i]).toEqual(1);
// 			} else if (i === 7) {
// 				expect(grid2D[i]).toEqual(2);
// 			} else {
// 				expect(grid2D[i]).toEqual(nullValForType('int32'));
// 			}
// 		}
// 	});

// 	it('hashes points on grid without padding', () => {
// 		const params = {...texturingParams, PADDING: new Vector2(2, 1)};
// 		const bounds = textureMapTestTri.calcAllBounds(params.PADDING)[0] as Bounds2;
// 		const hashGridSize = TextureMap.calcHashGridSize(bounds);
// 		textureMapTestTri.saveGreyscaleTexture(fileParamsTestTri, params, 0, false);

// 		// Test that points are hashed to grid correctly.
// 		const grid2D = new Int32Array(hashGridSize.x * hashGridSize.y);
// 		gpuHelperTestTri.copyDataFromGPUBuffer('grid2D', grid2D);
// 		for (let i = 0; i < grid2D.length; i++) {
// 			if (i === hashGridSize.x * params.PADDING.y + params.PADDING.x) {
// 				expect(grid2D[i]).toEqual(0);
// 			} else if (i === hashGridSize.x * (params.PADDING.y + 1) + params.PADDING.x + 2) {
// 				expect(grid2D[i]).toEqual(1);
// 			} else if (i === hashGridSize.x * (params.PADDING.y + 2) + params.PADDING.x + 1) {
// 				expect(grid2D[i]).toEqual(2);
// 			} else {
// 				expect(grid2D[i]).toEqual(nullValForType('int32'));
// 			}
// 		}
// 	});

// 	it('calculates the nearest triangle for hash grid with radius = 2', () => {
// 		const params = {...texturingParams, PADDING: new Vector2(0, 0), TRIANGLE_SEARCH_RADIUS: 2};
// 		const bounds = textureMapTestTri.calcAllBounds(params.PADDING)[0] as Bounds2;
// 		const hashGridSize = TextureMap.calcHashGridSize(bounds);
	
// 		// Check that nearest triangle lookup is working.
// 		textureMapTestTri.saveGreyscaleTexture(fileParamsTestTri, params, 0, false);
// 		const triangles2D = new Int32Array(hashGridSize.x * hashGridSize.y * 3);
// 		gpuHelperTestTri.copyDataFromGPUBuffer('triangles2D', triangles2D);
// 		// All pixels will satisfy this.
// 		for (let i = 0; i < triangles2D.length / 3; i++) {
// 			const vals = [triangles2D[3*i], triangles2D[3*i+1], triangles2D[3*i+2]];
// 			expect(vals.indexOf(0) >= 0).toBe(true);
// 			expect(vals.indexOf(1) >= 0).toBe(true);
// 			expect(vals.indexOf(2) >= 0).toBe(true);
// 		}
// 	});

// 	it('calculates the nearest triangle for hash grid with radius = 1', () => {
// 		const params = {...texturingParams, PADDING: new Vector2(3, 4), TRIANGLE_SEARCH_RADIUS: 1};
// 		const bounds = textureMapTestTri.calcAllBounds(params.PADDING)[0] as Bounds2;
// 		const hashGridSize = TextureMap.calcHashGridSize(bounds);
	
// 		textureMapTestTri.saveGreyscaleTexture(fileParamsTestTri, params, 0, false);
// 		const triangles2D = new Int32Array(hashGridSize.x * hashGridSize.y * 3);
// 		gpuHelperTestTri.copyDataFromGPUBuffer('triangles2D', triangles2D);
// 		// Only one pixel with satisfy this.
// 		for (let i = 0; i < triangles2D.length / 3; i++) {
// 			const vals = [triangles2D[3*i], triangles2D[3*i+1], triangles2D[3*i+2]];
// 			if (i === hashGridSize.x * (params.PADDING.y + 1) + params.PADDING.x + 1)	 {
// 				expect(vals.indexOf(0) >= 0).toBe(true);
// 				expect(vals.indexOf(1) >= 0).toBe(true);
// 				expect(vals.indexOf(2) >= 0).toBe(true);
// 			} else {
// 				const nullVal = nullValForType('int32');
// 				expect(vals[0]).toEqual(nullVal);
// 				expect(vals[1]).toEqual(nullVal);
// 				expect(vals[2]).toEqual(nullVal);
// 			}
// 		}
// 	});

// 	it('calculates the nearest triangle for hash grid with barycentric >= -1 filtering', () => {
// 		const params = {...texturingParams, PADDING: new Vector2(1, 1), TRIANGLE_SEARCH_RADIUS: 3};
// 		const bounds = textureMapTestTri.calcAllBounds(params.PADDING)[0] as Bounds2;
// 		const hashGridSize = TextureMap.calcHashGridSize(bounds);
	
// 		// Check that nearest triangle lookup is working.
// 		textureMapTestTri.saveGreyscaleTexture(fileParamsTestTri, params, 0, false);
// 		const triangles2D = new Int32Array(hashGridSize.x * hashGridSize.y * 3);
// 		gpuHelperTestTri.copyDataFromGPUBuffer('triangles2D', triangles2D);
// 		// Some px are pruned by barycentric filtering.
// 		for (let i = 0; i < triangles2D.length / 3; i++) {
// 			const vals = [triangles2D[3*i], triangles2D[3*i+1], triangles2D[3*i+2]];
// 			if (i === (hashGridSize.x * 3) || i === (hashGridSize.x * 4) || i === (hashGridSize.x * 4 + 1)) {
// 				expect(vals[0]).toEqual(nullValForType('int32'));
// 				expect(vals[1]).toEqual(nullValForType('int32'));
// 				expect(vals[2]).toEqual(nullValForType('int32'));
// 			} else {
// 				expect(vals.indexOf(0) >= 0).toBe(true);
// 				expect(vals.indexOf(1) >= 0).toBe(true);
// 				expect(vals.indexOf(2) >= 0).toBe(true);
// 			}
			
// 		}
// 	});

// 	it('calculates the barycentric coordinates for each pixel', () => {
// 		const params = { ...texturingParams, SCALE: 1, PADDING: new Vector2(0, 0) };
// 		const bounds = textureMapTestTri.calcAllBounds(params.PADDING)[0] as Bounds2;
// 		const hashGridSize = TextureMap.calcHashGridSize(bounds);
	
// 		textureMapTestTri.saveGreyscaleTexture(fileParamsTestTri, params, 0, false);
// 		const barycentrics = new Float32Array(hashGridSize.x * hashGridSize.y * 3);
// 		gpuHelperTestTri.copyDataFromGPUBuffer('barycentrics', barycentrics);
// 		for (let i = 0; i < barycentrics.length / 3; i++) {
// 			const vals = [barycentrics[3*i], barycentrics[3*i+1], barycentrics[3*i+2]];
// 			// Barycentrics should sum to 1.
// 			expect(vals[0] + vals[1] + vals[2]).toBeCloseTo(1);
// 		}
// 	});

// 	it('calculates the barycentric coordinates for each pixel with positive scaling', () => {
// 		const params = { ...texturingParams, SCALE: 10, PADDING: new Vector2(0, 0) };
// 		const bounds = textureMapTestTri.calcAllBounds(params.PADDING)[0] as Bounds2;
// 		const hashGridSize = TextureMap.calcHashGridSize(bounds);
// 		const imageSize = TextureMap.calcImageSize(hashGridSize, params.SCALE);
	
// 		textureMapTestTri.saveGreyscaleTexture(fileParamsTestTri, params, 0, false);
// 		const barycentrics = new Float32Array(imageSize.x * imageSize.y * 3);
// 		gpuHelperTestTri.copyDataFromGPUBuffer('barycentrics', barycentrics);
// 		for (let i = 0; i < barycentrics.length / 3; i++) {
// 			const vals = [barycentrics[3*i], barycentrics[3*i+1], barycentrics[3*i+2]];
// 			// Barycentrics should sum to 1.
// 			expect(vals[0] + vals[1] + vals[2]).toBeCloseTo(1);
// 		}
// 	});

// 	it('calculates the barycentric coordinates for each pixel with positive scaling and padding', () => {
// 		const params = { ...texturingParams, SCALE: 3, PADDING: new Vector2(2, 1), TRIANGLE_SEARCH_RADIUS: 2 };
// 		const bounds = textureMapTestTri.calcAllBounds(params.PADDING)[0] as Bounds2;
// 		const hashGridSize = TextureMap.calcHashGridSize(bounds);
// 		const imageSize = TextureMap.calcImageSize(hashGridSize, params.SCALE);
	
// 		textureMapTestTri.saveGreyscaleTexture(fileParamsTestTri, params, 0, false);
// 		const barycentrics = new Float32Array(imageSize.x * imageSize.y * 3);
// 		gpuHelperTestTri.copyDataFromGPUBuffer('barycentrics', barycentrics);
// 		for (let i = 0; i < barycentrics.length / 3; i++) {
// 			const vals = [barycentrics[3*i], barycentrics[3*i+1], barycentrics[3*i+2]];
// 			const x = i % imageSize.x;
// 			const y = Math.floor(i / imageSize.x);
// 			if (x < params.PADDING.x * params.SCALE || x >= imageSize.x - params.PADDING.x * params.SCALE
// 				|| y < params.PADDING.y * params.SCALE || y >= imageSize.y - params.PADDING.y * params.SCALE) {
// 				const nullVal = nullValForType('float32');
// 				expect(vals[0]).toEqual(nullVal);
// 				expect(vals[1]).toEqual(nullVal);
// 				expect(vals[2]).toEqual(nullVal);
// 			} else {
// 				// Barycentrics should sum to 1.
// 				expect(vals[0] + vals[1] + vals[2]).toBeCloseTo(1);
// 			}
// 		}
// 	});
// });