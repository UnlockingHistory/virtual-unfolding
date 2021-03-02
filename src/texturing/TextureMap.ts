import { saveBMP } from '../common/BmpWriter';
import { FileParams, TexturingParams, Bounds2, Type } from '../common/types';
import { Vector2, Vector3 } from 'three';
import MutableTypedArray from '../common/MutableTypedArray'; 
import { dataSizeForType } from '../common/utils';
import { saveOBJ } from '../common/ObjWriter';
import { calcMeshNormals, calcMeshNormals2D } from '../common/CalcMeshNormals';
import { readDataToArray } from '../common/io';
import { BIN_HEADER_NUM_BYTES } from '../common/Defaults';
import { gpuHelper } from '../globals/gpuHelper';
import earcut from 'earcut';

// TODO: don't really need mutable typed array in here.

export default class TextureMap {
	// Data to load.
	private points2DList: MutableTypedArray;
	private points2DBuffer?: Buffer;
	private meshNumbersList: MutableTypedArray;
	private points3DList: MutableTypedArray;
	private meshNeighborsList: MutableTypedArray;
	private iterMappedList: MutableTypedArray;
	// Variables for optimizing caching.
	private lastMeshNum?: number;
	private needsHashUpdate = true;

    constructor(fileParams: FileParams, texturingParams: TexturingParams) {

		// Load data.
		this.points2DList = MutableTypedArray.initFromFile(fileParams.OUTPUT_PATH, `${fileParams.FILENAME}_points2DList`);
		this.meshNumbersList = MutableTypedArray.initFromFile(fileParams.OUTPUT_PATH, `${fileParams.FILENAME}_meshNumbersList`);
		this.points3DList = MutableTypedArray.initFromFile(fileParams.OUTPUT_PATH, `${fileParams.FILENAME}_points3DList`);
		this.meshNeighborsList = MutableTypedArray.initFromFile(fileParams.OUTPUT_PATH, `${fileParams.FILENAME}_meshNeighborsList`);
		this.iterMappedList = MutableTypedArray.initFromFile(fileParams.OUTPUT_PATH, `${fileParams.FILENAME}_iterMappedList`);
		const normalsList = MutableTypedArray.initFromFile(fileParams.OUTPUT_PATH, `${fileParams.FILENAME}_normalsList`);

		const NUM_POINTS = this.points3DList.getLength();

        // Add data to gpu.
        gpuHelper.createGpuBufferFromMutableTypedArray('positions2D', this.points2DList, 'read');
		gpuHelper.createGpuBufferFromMutableTypedArray('meshNumbers', this.meshNumbersList, 'read');
		gpuHelper.createGpuBufferFromMutableTypedArray('positions3D', this.points3DList, 'read');
		gpuHelper.createGpuBufferFromMutableTypedArray('meshNeighbors', this.meshNeighborsList, 'read');
		gpuHelper.createGPUBuffer('meshNormals', null, 'float*', 'readwrite', 3 * NUM_POINTS);
		gpuHelper.createGpuBufferFromMutableTypedArray('normals', normalsList, 'read');
		gpuHelper.createGpuBufferFromMutableTypedArray('iterMapped', this.iterMappedList, 'read');
		gpuHelper.createGPUBufferFromTom('rawData3D', fileParams.DATA_PATH, `${fileParams.FILENAME}`, 'read');
		gpuHelper.createGPUBuffer('rawData3DSize', Int32Array.from(fileParams.DIMENSIONS.toArray()), 'int*', 'read');
		
		// Init programs.
        const path = './src/texturing/gpu/';
		const extension = '.cl';
		const compileArgs = {
			TEXTURING_SCALE: {
				value: texturingParams.SCALE,
				type: 'uint32' as Type,
			},
			MAX_NUM_NEIGHBORS: {
				value: this.meshNeighborsList.numElementsPerIndex,
				type: 'uint32' as Type,
			},
			TRIANGLE_SEARCH_RADIUS: {
				value: texturingParams.TRIANGLE_SEARCH_RADIUS,
				type: 'float32' as Type,
			},
		};
        gpuHelper.initProgram(`${path}assignToGridProgram${extension}`, 'assignToGrid', compileArgs);
        gpuHelper.initProgram(`${path}triangles2DCalcProgram${extension}`, 'triangles2DCalc', compileArgs);
        gpuHelper.initProgram(`${path}barycentricCalcProgram${extension}`, 'barycentricCalc', compileArgs);
        gpuHelper.initProgram(`${path}tomLookupProgram${extension}`, 'tomLookup', compileArgs);
        gpuHelper.initProgram(`${path}strainCalcProgram${extension}`, 'strainCalc', compileArgs);
        gpuHelper.initProgram(`${path}curvatureCalcProgram${extension}`, 'curvatureCalc', compileArgs);
        gpuHelper.initProgram(`${path}valueLookupProgram${extension}`, 'intValueToRGB', compileArgs);
        gpuHelper.initProgram(`${path}valueLookupProgram${extension}`, 'floatValueToRGB', compileArgs);
		gpuHelper.initProgram(`${path}creasePatternProgram${extension}`, 'creasePattern', compileArgs);
		gpuHelper.initProgram(`${path}triangleMeshBuilderProgram${extension}`, 'triangleMeshBuilder', compileArgs);
		gpuHelper.initProgram(`${path}triangleMeshResMaskProgram${extension}`, 'triangleMeshResMask', compileArgs);
		gpuHelper.initProgram(`${path}flipMeshNormalsProgram${extension}`, 'flipMeshNormals', compileArgs);

		// Calc 3D mesh normals.
		gpuHelper.nullBuffer('meshNormals');
		calcMeshNormals(gpuHelper, {
			pointsBufferName: 'positions3D',
			neighborsBufferName: 'meshNeighbors',
			normalsBufferName: 'normals',
			meshNormalsBufferName: 'meshNormals',
		}, NUM_POINTS, this.meshNeighborsList.numElementsPerIndex);
		// Calc 2D mesh normals.
		gpuHelper.createGPUBuffer('meshNormals2D', null, 'float*', 'readwrite', 3 * NUM_POINTS);
		gpuHelper.nullBuffer('meshNormals2D');
		calcMeshNormals2D(gpuHelper, {
			pointsBufferName: 'positions2D',
			neighborsBufferName: 'meshNeighbors',
			meshNormalsBufferName: 'meshNormals2D',
		}, NUM_POINTS, this.meshNeighborsList.numElementsPerIndex);
		// Selectively flip mesh normals so they have a consistent orientation in 2D.
		gpuHelper.setBufferArgument('flipMeshNormals', 0, 'meshNormals2D');
		gpuHelper.setBufferArgument('flipMeshNormals', 1, 'meshNormals');
		gpuHelper.runProgram('flipMeshNormals', NUM_POINTS);
		gpuHelper.releaseGPUBuffer('meshNormals2D');
	}

    getMaxMeshNum() {
        let max = -1;
        for (let i = 0, length = this.meshNumbersList.getLength(); i < length; i++) {
            const meshNum = this.meshNumbersList.get(i);
            if (meshNum === null) continue;
            if (meshNum > max) {
                max = meshNum;
            }
        }
        if (max < 0) {
            throw new Error('Error calculating max mesh num.');
        }
        return max;
    }

	// It's slightly more efficient to compute bounds for all meshes at once.
    calcAllBounds(padding: Vector2) {
		const maxMeshNum = this.getMaxMeshNum();
        // Calculate bounds.
        const allBounds: Bounds2[] = [];
        for (let currentMeshNum = 0; currentMeshNum <= maxMeshNum; currentMeshNum++) {
            const bounds = {
                min: new Vector2(Infinity, Infinity),
                max: new Vector2(-Infinity, -Infinity),
            };
            allBounds.push(bounds);
		}
		const v = new Vector2();
        for (let i = 0, length = this.points2DList.getLength(); i < length; i++) {
            const position = this.points2DList.getVector2(i, v);
            if (position === null) {
                continue;
            }
            const currentMeshNum = this.meshNumbersList.get(i) as number;
            allBounds[currentMeshNum].min = (allBounds[currentMeshNum].min).min(position);
            allBounds[currentMeshNum].max = (allBounds[currentMeshNum].max).max(position);
        }

		// Post-process bounds.
        return allBounds.map(bounds => {
			bounds.max = bounds.max.floor();
            bounds.min = bounds.min.floor();

            if (bounds.min.x === Infinity) {
                // No points in this meshNum.
                return null;
			}
			// Add padding.
			bounds.min.sub(padding);
			bounds.max.add(padding);
			return bounds;
		});
	}
	
	calcBounds(currentMeshNum: number, padding: Vector2) {
        // Calculate bounds.
        const bounds = {
            min: new Vector2(Infinity, Infinity),
            max: new Vector2(-Infinity, -Infinity),
		};
		const v = new Vector2();
        for (let i = 0, length = this.points2DList.getLength(); i < length; i++) {
            if (this.meshNumbersList.get(i) === currentMeshNum) {
                const position = this.points2DList.getVector2(i, v);
                if (position === null) {
                    continue;
                }
                bounds.min = bounds.min.min(position);
                bounds.max = bounds.max.max(position);
            }
        }

		// Post-process bounds.
        bounds.max = bounds.max.floor();
		bounds.min = bounds.min.floor();

		if (bounds.min.x === Infinity) {
			// No points in this meshNum.
			return null;
		}

		// Add padding.
		bounds.min.sub(padding);
		bounds.max.add(padding);

        return bounds;
	}

    static calcHashGridSize(bounds: Bounds2) {
		return bounds.max.clone().sub(bounds.min).add(new Vector2(1, 1));
	}
	
	static calcImageSize(hashGridSize: Vector2, scale: number) {
		return hashGridSize.clone().multiplyScalar(scale);
	}

    private assignPtsToGrid(currentMeshNum: number, bounds: Bounds2, hashGridSize: Vector2) {
        // Populate grid.
        gpuHelper.createGPUBuffer('grid2D', null, 'int*', 'readwrite', hashGridSize.x * hashGridSize.y, true);
        // Set grid2D to null.
		gpuHelper.nullBuffer('grid2D');
        // Add pts2D to grid.
        gpuHelper.setBufferArgument('assignToGrid', 0, 'grid2D');
        gpuHelper.setBufferArgument('assignToGrid', 1, 'positions2D');
        gpuHelper.setBufferArgument('assignToGrid', 2, 'meshNumbers');
		gpuHelper.setKernelArgument('assignToGrid', 3, 'int', bounds.min.x);
		gpuHelper.setKernelArgument('assignToGrid', 4, 'int', bounds.min.y);
		gpuHelper.setKernelArgument('assignToGrid', 5, 'int', hashGridSize.x);
		gpuHelper.setKernelArgument('assignToGrid', 6, 'int', currentMeshNum);
        gpuHelper.runProgram('assignToGrid', this.points2DList.getLength());
    }

    private calcNearestTriangles(bounds: Bounds2, hashGridSize: Vector2) {

        // Find three nearest neighbors to each grid element.
        gpuHelper.createGPUBuffer('triangles2D', null, 'int*', 'readwrite', hashGridSize.x * hashGridSize.y * 3, true);
		
		// Set triangles2D to null.
		gpuHelper.nullBuffer('triangles2D');

        gpuHelper.setBufferArgument('triangles2DCalc', 0, 'triangles2D');
        gpuHelper.setBufferArgument('triangles2DCalc', 1, 'grid2D');
		gpuHelper.setBufferArgument('triangles2DCalc', 2, 'positions2D');
        gpuHelper.setKernelArgument('triangles2DCalc', 3, 'int', hashGridSize.x);
        gpuHelper.setKernelArgument('triangles2DCalc', 4, 'int', hashGridSize.y);
        gpuHelper.setKernelArgument('triangles2DCalc', 5, 'int', bounds.min.x);
		gpuHelper.setKernelArgument('triangles2DCalc', 6, 'int', bounds.min.y);
        gpuHelper.runProgram('triangles2DCalc', hashGridSize.x * hashGridSize.y);
    }

    private calcBarycentricCoordinates(bounds: Bounds2, hashGridSize: Vector2, imageSize: Vector2) {
        // Calc barycentric coords for each pixel.
        gpuHelper.createGPUBuffer('barycentrics', null, 'float*', 'readwrite', imageSize.x * imageSize.y * 3, true);
        // Set barycentrics to null.
		gpuHelper.nullBuffer('barycentrics');

        gpuHelper.setBufferArgument('barycentricCalc', 0, 'barycentrics');
        gpuHelper.setBufferArgument('barycentricCalc', 1, 'positions2D');
		gpuHelper.setBufferArgument('barycentricCalc', 2, 'triangles2D');
		gpuHelper.setKernelArgument('barycentricCalc', 3, 'int', bounds.min.x);
		gpuHelper.setKernelArgument('barycentricCalc', 4, 'int', bounds.min.y);
        gpuHelper.setKernelArgument('barycentricCalc', 5, 'int', hashGridSize.x);
        gpuHelper.runProgram('barycentricCalc', imageSize.x * imageSize.y);
    }

    private initImageOnGPU(numBytes: number, backgroundVal = 0) {
        gpuHelper.createGPUBuffer('image', null, 'uchar*', 'write',
            numBytes, true);
        // Set image to backgroundVal.
        gpuHelper.setBufferValue('image', backgroundVal);
    }

    private hashPoints(currentMeshNum: number, bounds: Bounds2, hashGridSize: Vector2, imageSize: Vector2) {
        if (this.needsHashUpdate || this.lastMeshNum !== currentMeshNum) {
            // Precompute spatial hashing of flat points.
			this.assignPtsToGrid(currentMeshNum, bounds, hashGridSize);
			
            // Precompute three nearest neighbors to grid elements.
			this.calcNearestTriangles(bounds, hashGridSize);
			
            // Precompute barycentric coordinates for each pixel.
			this.calcBarycentricCoordinates(bounds, hashGridSize, imageSize);

			// Set update flag.
            this.needsHashUpdate = false;
		}
		// Save mesh num so we don't recompute unnecessarily.
        this.lastMeshNum = currentMeshNum;
    }

	private saveRGBImageFromBuffer(path: string, filename: string, bufferName: string, 
		bounds: Bounds2, hashGridSize: Vector2, imageSize: Vector2, texturingParams: TexturingParams, minVal: number, maxVal: number, 
		currentMeshNum: number, backgroundVal: number) {
	
        // Precompute some info (barycentrics, nearest neighbors).
        this.hashPoints(currentMeshNum, bounds, hashGridSize, imageSize);

        // Init RGB image.
        const numChannels = 3;
        this.initImageOnGPU(imageSize.x * imageSize.y * numChannels, backgroundVal);

        switch (gpuHelper.typeForGPUBuffer(bufferName)) {
            case 'int*':
                gpuHelper.setBufferArgument('intValueToRGB', 0, 'image');
                gpuHelper.setBufferArgument('intValueToRGB', 1, bufferName);
                gpuHelper.setBufferArgument('intValueToRGB', 2, 'barycentrics');
                gpuHelper.setBufferArgument('intValueToRGB', 3, 'triangles2D');
                gpuHelper.setKernelArgument('intValueToRGB', 4, 'int', minVal);
                gpuHelper.setKernelArgument('intValueToRGB', 5, 'int', maxVal);
                gpuHelper.setKernelArgument('intValueToRGB', 6, 'int', hashGridSize.x);
                gpuHelper.runProgram('intValueToRGB', imageSize.x * imageSize.y);
                break;
            case 'float*':
                gpuHelper.setBufferArgument('floatValueToRGB', 0, 'image');
                gpuHelper.setBufferArgument('floatValueToRGB', 1, bufferName);
                gpuHelper.setBufferArgument('floatValueToRGB', 2, 'barycentrics');
                gpuHelper.setBufferArgument('floatValueToRGB', 3, 'triangles2D');
                gpuHelper.setKernelArgument('floatValueToRGB', 4, 'float', minVal);
                gpuHelper.setKernelArgument('floatValueToRGB', 5, 'float', maxVal);
				gpuHelper.setKernelArgument('floatValueToRGB', 6, 'int', hashGridSize.x);
                gpuHelper.runProgram('floatValueToRGB', imageSize.x * imageSize.y);
                break;
            default:
                throw new Error(`Unsupported data type: ${gpuHelper.typeForGPUBuffer(bufferName)}`);
        }

        // Copy data off gpu.
        const rgbImage = new Uint8Array(imageSize.x * imageSize.y * numChannels);
        gpuHelper.copyDataFromGPUBuffer('image', rgbImage);

        // Save as bmp.
        saveBMP(path, filename + '_Mesh' + currentMeshNum,
            rgbImage, imageSize.x, imageSize.y, numChannels);
	}
	
	saveGreyscaleTexture(OUTPUT_PATH: string, FILENAME: string, texturingParams: TexturingParams, currentMeshNum: number, flipDirection = false, bounds?: Bounds2 | null) {
		if (bounds === undefined) {
			bounds = this.calcBounds(currentMeshNum, texturingParams.PADDING);
		}
		if (bounds === null) {
			// Ignore if mesh contains no points.
			return;
		}
		const hashGridSize = TextureMap.calcHashGridSize(bounds);
		const imageSize = TextureMap.calcImageSize(hashGridSize, texturingParams.SCALE);

		const Z_OFFSET = flipDirection ? -texturingParams.Z_OFFSET : texturingParams.Z_OFFSET;

        // Hash data.
        this.hashPoints(currentMeshNum, bounds, hashGridSize, imageSize);

        // Init greyscale image.
		const numChannels = 1;
		this.initImageOnGPU(imageSize.x * imageSize.y * numChannels);
        gpuHelper.setBufferArgument('tomLookup', 0, 'image');
        gpuHelper.setBufferArgument('tomLookup', 1, 'rawData3D');
        gpuHelper.setBufferArgument('tomLookup', 2, 'rawData3DSize');
        gpuHelper.setBufferArgument('tomLookup', 3, 'positions3D');
        gpuHelper.setBufferArgument('tomLookup', 4, 'barycentrics');
		gpuHelper.setBufferArgument('tomLookup', 5, 'triangles2D');
		gpuHelper.setBufferArgument('tomLookup', 6, 'meshNormals');
        gpuHelper.setKernelArgument('tomLookup', 7, 'int', hashGridSize.x);
		gpuHelper.setKernelArgument('tomLookup', 8, 'float', Z_OFFSET);
		
        gpuHelper.runProgram('tomLookup', imageSize.x * imageSize.y * numChannels);
		// Copy data off gpu.
        const greyscaleImage = new Uint8Array(imageSize.x * imageSize.y * numChannels);
        gpuHelper.copyDataFromGPUBuffer('image', greyscaleImage);

        // Save as bmp.
		let name = `${FILENAME}_Mesh${currentMeshNum}`;
		if (Z_OFFSET !== 0) name += `_${Z_OFFSET}_offset`;
        saveBMP(OUTPUT_PATH, name,
            greyscaleImage, imageSize.x, imageSize.y, numChannels);
    }

	// Iternum that each pts was added, mapped to color.
    saveIterMappedTexture(fileParams: FileParams, texturingParams: TexturingParams, currentMeshNum: number, bounds?: Bounds2 | null) {
		if (bounds === undefined) {
			bounds = this.calcBounds(currentMeshNum, texturingParams.PADDING);
		}
		if (bounds === null) {
			// Ignore if mesh contains no points.
			return;
		}
		const hashGridSize = TextureMap.calcHashGridSize(bounds);
		const imageSize = TextureMap.calcImageSize(hashGridSize, texturingParams.SCALE);

        // Calc max value of iterAdded.
        let maxVal = 0;
        for (let i = 0, NUM_POINTS = this.iterMappedList.getLength(); i < NUM_POINTS; i++) {
			const val = this.iterMappedList.get(i);
			if (val === null) {
                continue;
            }
            if (val > maxVal) {
                maxVal = val;
            }
		}

        // // Color of seed meshes - light blue.
        // const defaultColor = [187/255, 215/255, 1] as [number, number, number];

        this.saveRGBImageFromBuffer(fileParams.OUTPUT_PATH, fileParams.FILENAME + '_Indices', 'iterMapped', bounds, hashGridSize, imageSize,
            texturingParams, 0, maxVal, currentMeshNum, 255);
	}

	// Vertex strain of 2D mesh, mapped to color.
    saveStrainTexture(fileParams: FileParams, texturingParams: TexturingParams, currentMeshNum: number, bounds?: Bounds2 | null) {
		if (bounds === undefined) {
			bounds = this.calcBounds(currentMeshNum, texturingParams.PADDING);
		}
		if (bounds === null) {
			// Ignore if mesh contains no points.
			return;
		}
		const hashGridSize = TextureMap.calcHashGridSize(bounds);
		const imageSize = TextureMap.calcImageSize(hashGridSize, texturingParams.SCALE);

        // Compute per-vertex strain if needed.
        if (!gpuHelper.gpuBufferExists('vertexStrains')) {
            // Init storage for per point strain.
            const numPoints = this.points2DList.getLength();
            gpuHelper.createGPUBuffer('vertexStrains', null, 'float*', 'readwrite', numPoints);
            gpuHelper.zeroBuffer('vertexStrains');

            // Calculate per point strain.
            gpuHelper.setBufferArgument('strainCalc', 0, 'vertexStrains');
            gpuHelper.setBufferArgument('strainCalc', 1, 'positions2D');
            gpuHelper.setBufferArgument('strainCalc', 2, 'positions3D');
            gpuHelper.setBufferArgument('strainCalc', 3, 'meshNeighbors');
            gpuHelper.runProgram('strainCalc', numPoints);
        }

        this.saveRGBImageFromBuffer(fileParams.OUTPUT_PATH, fileParams.FILENAME + '_Strain', 'vertexStrains', bounds, hashGridSize, imageSize, texturingParams,
            0, texturingParams.STRAIN_CLIP_VAL, currentMeshNum, 255);
    }

	private computeCurvature() {
		// Init storage for per point curvature.
		const numPoints = this.points2DList.getLength();
		gpuHelper.createGPUBuffer('vertexCurvatures', null, 'float*', 'readwrite', numPoints);
		gpuHelper.zeroBuffer('vertexCurvatures');

		// Calculate per point curvature.
		gpuHelper.setBufferArgument('curvatureCalc', 0, 'vertexCurvatures');
		gpuHelper.setBufferArgument('curvatureCalc', 1, 'meshNormals');
		gpuHelper.setBufferArgument('curvatureCalc', 2, 'positions3D');
		gpuHelper.setBufferArgument('curvatureCalc', 3, 'positions2D');
		gpuHelper.setBufferArgument('curvatureCalc', 4, 'meshNeighbors');
		gpuHelper.runProgram('curvatureCalc', numPoints);
	}

	// Local curvature of 3D mesh, mapped to red/blue.
    saveCreasePattern(fileParams: FileParams, texturingParams: TexturingParams, currentMeshNum: number, flipDirection = false, bounds?: Bounds2 | null) {
        if (bounds === undefined) {
			bounds = this.calcBounds(currentMeshNum, texturingParams.PADDING);
		}
		if (bounds === null) {
			// Ignore if mesh contains no points.
			return;
		}
		const hashGridSize = TextureMap.calcHashGridSize(bounds);
		const imageSize = TextureMap.calcImageSize(hashGridSize, texturingParams.SCALE);

        // Compute per-vertex curvature if needed.
        if (!gpuHelper.gpuBufferExists('vertexCurvatures')) {
            this.computeCurvature();
        }

		// Precompute some info (barycentrics, nearest neighbors).
        this.hashPoints(currentMeshNum, bounds, hashGridSize, imageSize);

        // Init RGB image.
        const numChannels = 3;
        this.initImageOnGPU(imageSize.x * imageSize.y * numChannels, 0);

        gpuHelper.setBufferArgument('creasePattern', 0, 'image');
        gpuHelper.setBufferArgument('creasePattern', 1, 'vertexCurvatures');
        gpuHelper.setBufferArgument('creasePattern', 2, 'barycentrics');
        gpuHelper.setBufferArgument('creasePattern', 3, 'triangles2D');
        gpuHelper.setKernelArgument('creasePattern', 4, 'float', flipDirection ? -texturingParams.CURVATURE_SCALING_FACTOR : texturingParams.CURVATURE_SCALING_FACTOR);
		gpuHelper.setKernelArgument('creasePattern', 5, 'int', hashGridSize.x);
        gpuHelper.runProgram('creasePattern', imageSize.x * imageSize.y);

        // Copy data off gpu.
        const rgbImage = new Uint8Array(imageSize.x * imageSize.y * numChannels);
        gpuHelper.copyDataFromGPUBuffer('image', rgbImage);

        // Save as bmp.
        saveBMP(fileParams.OUTPUT_PATH, `${fileParams.FILENAME}_CP${flipDirection ? '' : '_inv'}_Mesh${currentMeshNum}`, rgbImage, imageSize.x, imageSize.y, numChannels);
	}

	saveTriangleMesh(fileParams: FileParams, texturingParams: TexturingParams, currentMeshNum: number, scale = 1, scaleFine = 1, bounds?: Bounds2 | null) {
		if (bounds === undefined) {
			bounds = this.calcBounds(currentMeshNum, new Vector2(0, 0));
		}
		if (bounds === null) {
			// Ignore if mesh contains no points.
			return;
		}
		const hashGridSize = TextureMap.calcHashGridSize(bounds);
		const imageSize = TextureMap.calcImageSize(hashGridSize, texturingParams.SCALE);

		if (scale % scaleFine !== 0 || scale < scaleFine) {
			throw new Error(`Fine scale of triangle mesh must be integer multiple of coarse scale, got ${scale}, ${scaleFine}.`);
		}
		const scaleDiff = scale / scaleFine;

		// Precompute some info (barycentrics, nearest neighbors).
        this.hashPoints(currentMeshNum, bounds, hashGridSize, imageSize);

		// Compute per-vertex curvature if needed.
        if (!gpuHelper.gpuBufferExists('vertexCurvatures')) {
            this.computeCurvature();
        }

		// Init storage for high res mesh mask.
		gpuHelper.createGPUBuffer('highResMask', null, 'int*', 'readwrite', hashGridSize.x * hashGridSize.y);
		gpuHelper.zeroBuffer('highResMask');

		// Calculate per point curvature.
		gpuHelper.setBufferArgument('triangleMeshResMask', 0, 'highResMask');
		gpuHelper.setBufferArgument('triangleMeshResMask', 1, 'barycentrics');
		gpuHelper.setBufferArgument('triangleMeshResMask', 2, 'triangles2D');
		gpuHelper.setBufferArgument('triangleMeshResMask', 3, 'vertexCurvatures');
		gpuHelper.runProgram('triangleMeshResMask', hashGridSize.x * hashGridSize.y);
		// Copy data off gpu.
        const maskArray = new Int32Array(hashGridSize.x * hashGridSize.y);
		gpuHelper.copyDataFromGPUBuffer('highResMask', maskArray);
		gpuHelper.releaseGPUBuffer('highResMask');
		// Get position of nearest point in 3D.
		// Init a place for this information to live.
		gpuHelper.createGPUBuffer('triangleMeshPositions3D', null, 'float*', 'readwrite', hashGridSize.x * hashGridSize.y * 3, true);
		gpuHelper.setBufferArgument('triangleMeshBuilder', 0, 'triangleMeshPositions3D');
		gpuHelper.setBufferArgument('triangleMeshBuilder', 1, 'positions3D');
        gpuHelper.setBufferArgument('triangleMeshBuilder', 2, 'barycentrics');
		gpuHelper.setBufferArgument('triangleMeshBuilder', 3, 'triangles2D');
		gpuHelper.runProgram('triangleMeshBuilder', hashGridSize.x * hashGridSize.y);

		// Copy data off gpu.
        const verticesArray = new Float32Array(hashGridSize.x * hashGridSize.y * 3);
		gpuHelper.copyDataFromGPUBuffer('triangleMeshPositions3D', verticesArray);
		gpuHelper.releaseGPUBuffer('triangleMeshPositions3D');

		const vertices = new MutableTypedArray(verticesArray, true, 3);
		const mask = new MutableTypedArray(maskArray, false, 1);

		const hashGridSizeLowRes = hashGridSize.clone().divideScalar(scale).ceil();
		// Check if something is getting chopped off.
		const extraX = ((hashGridSize.x - 1) / scale) % 1 !== 0;
		const extraY = ((hashGridSize.y - 1) / scale) % 1 !== 0;
		// Add some extra space to vertices array.
		const tempVec = new Vector3();
		for (let i = vertices.getLength(); i < hashGridSizeLowRes.x * scale * hashGridSizeLowRes.y * scale; i++ ){
			vertices.pushVector3(tempVec);
			mask.push(0);
		}
		// Reindex vertices positions ans mask.
		const vertexData = vertices.getData();
		const maskData = mask.getData();
		for (let y = hashGridSizeLowRes.y * scale - 1; y >= 0; y--) {
			for (let x = hashGridSizeLowRes.x * scale - 1; x >= 0; x--) {
				const index = y * hashGridSizeLowRes.x * scale + x;
				const oldIndex = y * hashGridSize.x + x;
				if (x >= hashGridSize.x || y >= hashGridSize.y) {
					vertices.setVector3(index, null);
					mask.set(index, 0);
					continue;
				}
				// index is always >= old index.
				for (let i = 0; i < 3; i++) {
					vertexData[3 * index + i] = vertexData[3 * oldIndex + i];
					maskData[index + i] = maskData[oldIndex + i];
				}
			}
		}
		
		// Keep track of lower res cell types.
		const cellTypes = new Uint8Array(hashGridSizeLowRes.x * hashGridSizeLowRes.y);
		
		// Mesh is a standard triangulated grid at the resolution of the hashGrid.
		const faces = new MutableTypedArray(new Uint32Array(0), false, 3);
		const uvs = new MutableTypedArray(new Float32Array(vertices.getLength() * 2), true, 2);
		const vertices2D = new MutableTypedArray(new Float32Array(vertices.getLength() * 2), true, 2); // We need this for computing the unfolding.
		{
			const tempVector1 = new Vector2();
			const tempVector2 = new Vector3();
			for (let y = 0; y < hashGridSizeLowRes.y; y++) {
				for (let x = 0; x < hashGridSizeLowRes.x; x++) {
					for (let j = 0; j < scaleDiff; j++) {
						for (let i = 0; i < scaleDiff; i++) {
							const xHighRes = x * scale + i * scaleFine;
							const yHighRes = y * scale + j * scaleFine;
							const indexHighRes = yHighRes * hashGridSizeLowRes.x * scale + xHighRes;
							uvs.setVector2(indexHighRes, tempVector1.set(xHighRes / (hashGridSizeLowRes.x * scale), 1 - yHighRes / (hashGridSizeLowRes.y * scale)));
							vertices2D.setVector2(indexHighRes, tempVector1.set(xHighRes, yHighRes));
						}
					}
					const index = y * hashGridSizeLowRes.x + x;
					const indexHighRes = (y * scale) * hashGridSizeLowRes.x * scale + (x * scale);

					if (x >= hashGridSizeLowRes.x - 1 || y >= hashGridSizeLowRes.y - 1) {
						continue;
					}
					// Get coarse grid corner vertices.
					const v1 = indexHighRes;
					const v2 = indexHighRes + scale;
					const v3 = indexHighRes + scale * hashGridSizeLowRes.x * scale + scale;
					const v4 = indexHighRes + scale * hashGridSizeLowRes.x * scale;

					// Set cell type.
					// Type 0 = high res cell.
					// Type 1 = low res cell.
					// Count up the number of high res grid cells in this low res cell
					// that have curvature mask.
					let numMasked = 0;
					for (let j = 0; j < scaleDiff + 1; j++) {
						for (let i = 0; i < scaleDiff + 1; i++) {
							const xHighRes = x * scale + i * scaleFine;
							const yHighRes = y * scale + j * scaleFine;
							const indexHighRes = yHighRes * hashGridSizeLowRes.x * scale + xHighRes;
							numMasked += mask.get(indexHighRes)!;
						}
					}
					// if most are unmasked, mark as low res cell.
					if (numMasked / ((scaleDiff + 1) * (scaleDiff + 1)) < 0.5) {
						cellTypes[index] = 1;
					}
					// If any of the four corners is missing, set type 0.
					if (
						!vertices.getVector3(v1, tempVector2) ||
						!vertices.getVector3(v2, tempVector2) ||
						!vertices.getVector3(v3, tempVector2) ||
						!vertices.getVector3(v4, tempVector2)
					) {
						cellTypes[index] = 0;
					}
					
				}
			}
		}

		// Triangulate cells.
		{
			const memoizedTriangulation: {[key: string]: number[]} = {};
			const faceVertices = [0, 0, 0] as [number, number, number];
			const tempVector2 = new Vector3();
			const tempVector3 = new Vector2();
			const tempVector4 = new Vector2();
			const earcutList = [];
			const earcutPositions = [];
			const addFace = (faceVertices: [number, number, number]) => {
				if (
					vertices.getVector3(faceVertices[0], tempVector2) &&
					vertices.getVector3(faceVertices[1], tempVector2) &&
					vertices.getVector3(faceVertices[2], tempVector2)
				) {
					faces.push(faceVertices);
				}
			}

			for (let y = 0; y < hashGridSizeLowRes.y; y++) {
				for (let x = 0; x < hashGridSizeLowRes.x; x++) {
					const index = y * hashGridSizeLowRes.x + x;
					const indexHighRes = (y * scale) * hashGridSizeLowRes.x * scale + (x * scale);
					if (x < hashGridSizeLowRes.x - 1 && y < hashGridSizeLowRes.y - 1) {
						switch (cellTypes[index]) {
							case 0: {
								for (let j = 0; j < scaleDiff; j++) {
									for (let i = 0; i < scaleDiff; i++) {
										const indexHighRes = (y * scale + j * scaleFine) * hashGridSizeLowRes.x * scale + (x * scale + i * scaleFine);
										// Get fine grid corner vertices.
										const v1 = indexHighRes;
										const v2 = indexHighRes + scaleFine;
										const v3 = indexHighRes + scaleFine * hashGridSizeLowRes.x * scale + scaleFine;
										const v4 = indexHighRes + scaleFine * hashGridSizeLowRes.x * scale;
		
										// Triangulate cell.
										faceVertices[0] = v1;
										faceVertices[1] = v2;
										faceVertices[2] = v3;
										addFace(faceVertices);
										faceVertices[0] = v1;
										faceVertices[1] = v3;
										faceVertices[2] = v4;
										addFace(faceVertices);
									}
								}
								break;
							}
							case 1: {
								// Get coarse grid corner vertices.
								const v1 = indexHighRes;
								const v2 = indexHighRes + scale;
								const v3 = indexHighRes + scale * hashGridSizeLowRes.x * scale + scale;
								const v4 = indexHighRes + scale * hashGridSizeLowRes.x * scale;

								// First check if this cell is adjacent to a fine grid cell.
								const n = (y + 1) * hashGridSizeLowRes.x + x;
								const s = (y - 1) * hashGridSizeLowRes.x + x;
								const e = y * hashGridSizeLowRes.x + x + 1;
								const w = y * hashGridSizeLowRes.x + x - 1;
								const nFlag = (y < hashGridSizeLowRes.y - 2 && cellTypes[n] === 0) || (extraY && y === hashGridSizeLowRes.y - 2);
								const sFlag = y > 0 && cellTypes[s] === 0;
								const eFlag = (x < hashGridSizeLowRes.x - 2 && cellTypes[e] === 0) || (extraX && x === hashGridSizeLowRes.x - 2);
								const wFlag = x > 0 && cellTypes[w] === 0;
								if (
									scale !== scaleFine &&
									(nFlag || sFlag || eFlag || wFlag)
								) {
									// Adjacent to at least 1 fine grid cell.
									// Get all boundary vertices and triangulate with earcut.
									earcutList.length = 0;
									earcutList.push(v1);
									for (let i = 1; i < scaleDiff; i++) {
										if (sFlag) {
											earcutList.push((y * scale) * hashGridSizeLowRes.x * scale + (x * scale + i * scaleFine));
										}
									}
									earcutList.push(v2);
									for (let i = 1; i < scaleDiff; i++) {
										if (eFlag) {
											earcutList.push((y * scale + i * scaleFine) * hashGridSizeLowRes.x * scale + (x * scale + scale));
										}
									}
									earcutList.push(v3);
									for (let i = scaleDiff - 1; i > 0; i--) {
										if (nFlag) {
											earcutList.push((y * scale + scale) * hashGridSizeLowRes.x * scale + (x * scale + i * scaleFine));
										}
									}
									earcutList.push(v4);
									for (let i = scaleDiff - 1; i > 0; i--) {
										if (wFlag) {
											earcutList.push((y * scale + i * scaleFine) * hashGridSizeLowRes.x * scale + (x * scale));
										}
									}
									earcutPositions.length = 0;
									const basePosition = vertices2D.getVector2(earcutList[0], tempVector4)!;
									for (let i = 0; i < earcutList.length; i++) {
										// Get 2D positions for each vertex in earcut list.
										const j = earcutList[i];
										const vertexPosition = vertices2D.getVector2(j, tempVector3)!.sub(basePosition);
										earcutPositions.push(vertexPosition.x, vertexPosition.y);
									}
									const key = earcutPositions.join(',');
									let triList: number[];
									if (memoizedTriangulation[key]) {
										triList = memoizedTriangulation[key];
									} else {
										triList = earcut(earcutPositions);
										memoizedTriangulation[key] = triList;
									}
									for (let i = 0; i < triList.length / 3; i++) {
										faceVertices[0] = earcutList[triList[3 * i]];
										faceVertices[1] = earcutList[triList[3 * i + 1]];
										faceVertices[2] = earcutList[triList[3 * i + 2]];
										addFace(faceVertices);
									}
								} else {
									// Triangulate cell.
									faceVertices[0] = v1;
									faceVertices[1] = v2;
									faceVertices[2] = v3;
									addFace(faceVertices);
									faceVertices[0] = v1;
									faceVertices[1] = v3;
									faceVertices[2] = v4;
									addFace(faceVertices);
								}
								break;
							}
							default:
								console.log(x, y, hashGridSizeLowRes);
								throw new Error(`Unknown type ${cellTypes[index]}.`);
						}
					} else {
						// Grid anything extra at fine res.
						for (let j = 0; j < scaleDiff; j++) {
							for (let i = 0; i < scaleDiff; i++) {
								const xHighRes = x * scale + i * scaleFine;
								const yHighRes = y * scale + j * scaleFine;
								if (xHighRes >= hashGridSizeLowRes.x * scale - scaleFine || yHighRes >= hashGridSizeLowRes.y * scale - scaleFine) {
									continue;
								}
								const indexHighRes = yHighRes * hashGridSizeLowRes.x * scale + xHighRes;
								// Get fine grid corner vertices.
								const v1 = indexHighRes;
								const v2 = indexHighRes + scaleFine;
								const v3 = indexHighRes + scaleFine * hashGridSizeLowRes.x * scale + scaleFine;
								const v4 = indexHighRes + scaleFine * hashGridSizeLowRes.x * scale;

								// Triangulate cell.
								faceVertices[0] = v1;
								faceVertices[1] = v2;
								faceVertices[2] = v3;
								addFace(faceVertices);
								faceVertices[0] = v1;
								faceVertices[1] = v3;
								faceVertices[2] = v4;
								addFace(faceVertices);
							}
						}
					}
				}
				// break;
			}
		}

		// Set unused vertices to null.
		{
			const vertexMask = new Uint8Array(vertices.getLength());
			const tempArray: number[] = [];
			for (let i = 0; i < faces.getLength(); i++ ){
				const faceVertices = faces.get(i, tempArray);
				if (!faceVertices) continue;
				for (let j = 0; j < 3; j++) {
					vertexMask[faceVertices[j]] = 1;
				}
			}
			for (let i = 0; i < vertices.getLength(); i++ ){
				if (vertexMask[i] === 0) {
					vertices.set(i, null);
				}
			}
		}
		// Remove nulls from arrays and remap.
		const mapping = new Int32Array(vertices.getLength()).fill(-1);
		const mappingRev = new Int32Array(vertices.getLength()).fill(-1);
		let currentIndex = 0;
		{
			const tempVector1 = new Vector3();
			for (let i = 0; i < mapping.length; i++) {
				if (!vertices.getVector3(i, tempVector1)) {
					continue;
				}
				mapping[currentIndex] = i;
				mappingRev[i] = currentIndex;
				currentIndex++;
			}
		}
		const verticesPruned = new MutableTypedArray(new Float32Array(currentIndex * 3), false, 3);
		const uvsPruned = new MutableTypedArray(new Float32Array(currentIndex * 2), false, 2);
		{
			const tempVector1 = new Vector3();
			const tempVector2 = new Vector2();
			for (let i = 0; i < currentIndex; i++) {
				const map = mapping[i];
				const position3D = vertices.getVector3(map, tempVector1);
				if (!position3D) {
					throw new Error('Bad mapping computed.');
				}
				verticesPruned.setVector3(i, position3D);
				uvsPruned.setVector2(i, uvs.getVector2(map, tempVector2)!);
			}
		}
		{
			const tempArray1: number[] = [];
			for (let i = 0; i < faces.getLength(); i++) {
				const face = faces.get(i, tempArray1)!;
				for (let j = 0; j < 3; j++) {
					const newIndex = mappingRev[face[j]];
					face[j] = newIndex;
				}
				faces.set(i, face);
			}
		}

		// Write OBJ.
		saveOBJ(
			fileParams.OUTPUT_PATH,
			`${fileParams.FILENAME}_Mesh${currentMeshNum}`,
			`${fileParams.FILENAME}_Mesh${currentMeshNum}`,
			verticesPruned.getData() as Float32Array,
			(faces.getData() as Uint32Array).slice(0, faces.getLength() * faces.numElementsPerIndex),
			uvsPruned.getData() as Float32Array,
		);
	}

	updatePositions(fullPath: string) {
		if (!this.points2DBuffer) {
			this.points2DBuffer = Buffer.alloc(this.points2DList.getLength() * this.points2DList.numElementsPerIndex * dataSizeForType(this.points2DList.type));
		}
		readDataToArray(fullPath, BIN_HEADER_NUM_BYTES, this.points2DList.getData(), this.points2DBuffer);
		// Copy to gpu.
		gpuHelper.copyDataToGPUBuffer('positions2D', this.points2DList.getData() as Float32Array);
		this.needsHashUpdate = true;
	}
	
	// This is used for unit testing.
	clearCache() {
		this.needsHashUpdate = true;
	}

    destroy() {
    }
}
