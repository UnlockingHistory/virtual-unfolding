import { Vector2, Vector3 } from 'three';
import { flatteningParams } from '../common/Defaults';
import GPUHelper from '../common/GPUHelper';
import MutableTypedArray from '../common/MutableTypedArray';
import { FileParams, FlatteningParams, Type } from '../common/types';
import { arrayIntersection, log } from '../common/utils';
import { BFGSAlgorithm } from './BFGS';

const SQRT_3 = Math.sqrt(3);

const tempArray1: number[] = [];
const tempArray2: number[] = [];
const tempVector1 = new Vector2();
// Temp objects used in specific methods.
const _getDist3D_tempVector1 = new Vector3();
const _getDist3D_tempVector2 = new Vector3();
const _getDistSq3D_tempVector1 = new Vector3();
const _getDistSq3D_tempVector2 = new Vector3();
let _BFGS_constraintData: Float32Array;
const _BFGS_initialPosition = [0, 0];
const _savePoint2D_position = [0, 0];

export class Embedding2D {
	gpuHelper: GPUHelper;
	flatteningParams: FlatteningParams;
	fileParams: FileParams;
	// Saved Arrays.
	points3DList: MutableTypedArray;
	meshNumbersList: MutableTypedArray;
	meshNeighborsList: MutableTypedArray;
	// Computed arrays.
	points2DList: MutableTypedArray;
	iterMappedList: MutableTypedArray;
	meshSizesList: MutableTypedArray;
	mappedMeshSizesList: MutableTypedArray;
	mappingAttemptsRemainingList: MutableTypedArray;
	// Computational helpers.
	maxMeshNum: number;
	iterNum = 0; // Keep track of the number of iterations of flattening that have been run.
	bfgs = new BFGSAlgorithm({
		ERROR: 0.00001,
		MAX_ITERATOR: 20,
	});

    constructor(gpuHelper: GPUHelper, fileParams: FileParams, flatteningParams: FlatteningParams) {
		this.gpuHelper = gpuHelper;
		this.flatteningParams = flatteningParams;
		this.fileParams = fileParams;

		// Load up previously computed data.
		this.points3DList = MutableTypedArray.initFromFile(fileParams.OUTPUT_PATH, `${fileParams.FILENAME}_points3DList`);
		this.meshNumbersList = MutableTypedArray.initFromFile(fileParams.OUTPUT_PATH, `${fileParams.FILENAME}_meshNumbersList`);
		this.meshNeighborsList = MutableTypedArray.initFromFile(fileParams.OUTPUT_PATH, `${fileParams.FILENAME}_meshNeighborsList`);

		const NUM_POINTS = this.points3DList.getLength();

		// Init a space to store the flattened positions.
		this.points2DList = new MutableTypedArray(new Float32Array(2 * NUM_POINTS), true, 2);
		this.points2DList.clear(); // Fill with null to start.
		// Store the iter num when each point has been mapped (so we can track progress)
		this.iterMappedList = new MutableTypedArray(new Int32Array(NUM_POINTS), true);
		this.iterMappedList.clear(); // Fill with null to start.
		// Init a space to store the next points to check in mapping computation.
		this.mappingAttemptsRemainingList = new MutableTypedArray(new Uint8Array(NUM_POINTS), false);
		this.mappingAttemptsRemainingList.clear(); // Fill with zeros to start.
		// Init an array to store constraint data for BFGS.
		_BFGS_constraintData = new Float32Array(flatteningParams.MAX_BFGS_CONSTRAINTS * 3);

		// Init gpu buffers.
		this.gpuHelper.createGpuBufferFromMutableTypedArray('positions2D', this.points2DList, 'readwrite');
		this.gpuHelper.createGpuBufferFromMutableTypedArray('positions3D', this.points3DList, 'readwrite');
		this.gpuHelper.createGpuBufferFromMutableTypedArray('neighbors', this.meshNeighborsList, 'read');
		this.gpuHelper.createGpuBufferFromMutableTypedArray('meshNumbers', this.meshNumbersList, 'read');
		this.gpuHelper.createGpuBufferFromMutableTypedArray('mappingAttemptsRemaining', this.mappingAttemptsRemainingList, 'readwrite');
		this.gpuHelper.createGpuBufferFromMutableTypedArray('iterMapped', this.iterMappedList, 'readwrite');
		this.gpuHelper.createGPUBuffer('velocities2D', null, 'float*', 'readwrite', NUM_POINTS * 2);
		this.gpuHelper.zeroBuffer('velocities2D');
		this.gpuHelper.createGPUBuffer('nextPositions2D', null, 'float*', 'readwrite', NUM_POINTS * 2);
		this.gpuHelper.createGPUBuffer('nextVelocities2D', null, 'float*', 'readwrite', NUM_POINTS * 2);

		// Init flattening simulation program.
		const maxNatFreq = Math.sqrt(flatteningParams.AXIAL_STIFFNESS / 0.5); // Assume mass 1.
    	const DT = (1 / (2 * Math.PI * maxNatFreq)) * 0.9; // Add a scaling factor. of 0.9 for safety.
		this.gpuHelper.initProgram('./src/flattening/gpu/flatteningSimProgram.cl', 'flatteningSim', {
			MAX_NUM_NEIGHBORS: {
				value: this.meshNeighborsList.numElementsPerIndex,
				type: 'uint32' as Type,
			},
			AXIAL_STIFFNESS: {
				value: flatteningParams.AXIAL_STIFFNESS,
				type: 'float32' as Type,
			},
			DAMPING_FACTOR: {
				value: flatteningParams.DAMPING_FACTOR,
				type: 'float32' as Type,
			},
			DT: {
				value: DT,
				type: 'float32' as Type,
			},
		});
		this.gpuHelper.setBufferArgument('flatteningSim', 0, 'nextPositions2D');
		this.gpuHelper.setBufferArgument('flatteningSim', 1, 'nextVelocities2D');
		this.gpuHelper.setBufferArgument('flatteningSim', 2, 'positions2D');
		this.gpuHelper.setBufferArgument('flatteningSim', 3, 'velocities2D');
		this.gpuHelper.setBufferArgument('flatteningSim', 4, 'positions3D');
		this.gpuHelper.setBufferArgument('flatteningSim', 5, 'neighbors');

		// Init mapping program.
		this.gpuHelper.initProgram('./src/flattening/gpu/mapPoints2DProgram.cl', 'mapPoints2D', {
			MAX_NUM_NEIGHBORS: {
				value: this.meshNeighborsList.numElementsPerIndex,
				type: 'uint32' as Type,
			},
			MAX_BFGS_CONSTRAINTS: {
				value: flatteningParams.MAX_BFGS_CONSTRAINTS,
				type: 'uint32' as Type,
			},
			FLATTENING_EDGE_LENGTH_ERROR_TOL: {
				value: flatteningParams.FLATTENING_EDGE_LENGTH_ERROR_TOL,
				type: 'float32' as Type,
			},
		});
		this.gpuHelper.setBufferArgument('mapPoints2D', 0, 'positions2D');
		this.gpuHelper.setBufferArgument('mapPoints2D', 1, 'positions3D');
		this.gpuHelper.setBufferArgument('mapPoints2D', 2, 'neighbors');
		this.gpuHelper.setBufferArgument('mapPoints2D', 3, 'meshNumbers');
		this.gpuHelper.setBufferArgument('mapPoints2D', 4, 'mappingAttemptsRemaining');
		this.gpuHelper.setBufferArgument('mapPoints2D', 5, 'iterMapped');
		
		// Init updateMappingAttemptsRemaining program.
		this.gpuHelper.initProgram('./src/flattening/gpu/updateMappingAttemptsRemainingProgram.cl', 'updateMappingAttemptsRemaining', {
			MAX_NUM_NEIGHBORS: {
				value: this.meshNeighborsList.numElementsPerIndex,
				type: 'uint32' as Type,
			},
			MAX_NUM_MAPPING_ATTEMPTS: {
				value: flatteningParams.MAX_NUM_MAPPING_ATTEMPTS,
				type: 'uint8' as Type,
			},
		});
		this.gpuHelper.setBufferArgument('updateMappingAttemptsRemaining', 0, 'positions2D');
		this.gpuHelper.setBufferArgument('updateMappingAttemptsRemaining', 1, 'neighbors');
		this.gpuHelper.setBufferArgument('updateMappingAttemptsRemaining', 2, 'mappingAttemptsRemaining');
		this.gpuHelper.setBufferArgument('updateMappingAttemptsRemaining', 3, 'iterMapped');

		// Init an array to store the size of (num points contained within) each mesh component.
		this.meshSizesList = new MutableTypedArray(new Int32Array(NUM_POINTS), false);
		this.meshSizesList.clear();// Fill with zero to start.
		// Init an array to store the current size of each mesh that has been mapped.
		this.mappedMeshSizesList = new MutableTypedArray(new Int32Array(NUM_POINTS), false);
		this.mappedMeshSizesList.clear(); // Fill with zero to start.
		// Compute maximum mesh number.
		this.maxMeshNum = 0;
		for (let i = 0; i < NUM_POINTS; i++) {
			const meshNumber = this.meshNumbersList.get(i);
			if (meshNumber !== null) {
				// Increment mesh size.
				this.meshSizesList.set(meshNumber, this.meshSizesList.get(meshNumber)! + 1);
				// Increment max mesh num if possible.
				if (meshNumber > this.maxMeshNum) {
					this.maxMeshNum = meshNumber;
				}
			}
		}

		// Start by seeing mesh on cpu.
		for (let i = 0; i < NUM_POINTS; i++) {
			if (this.meshSizesList.get(i)) {
				// log(`\tseeding mesh ${i}`);
				this._seedMesh(i);
			}
		}
		
		// Copy data to GPU.
		this.gpuHelper.copyDataToGPUBuffer('positions2D', this.points2DList.getData() as Float32Array);
		this.gpuHelper.copyDataToGPUBuffer('iterMapped', this.iterMappedList.getData() as Int32Array);
		this.gpuHelper.finishAllEvents();

		// Add points to seeds until no points can be added.
		let active = true;
		while (active) {
			active = this.iter();
		}

		// Copy data back into CPU.
		this.gpuHelper.copyDataToMutableTypedArray('positions2D', this.points2DList);
		this.gpuHelper.copyDataToMutableTypedArray('iterMapped', this.iterMappedList);

		// Log results.
		for (let i = 0; i < NUM_POINTS; i++) {
			if (this.points2DList.getVector2(i, tempVector1)) {
				const meshNumber = this.meshNumbersList.get(i) as number;
				this.mappedMeshSizesList.set(meshNumber, this.mappedMeshSizesList.get(meshNumber)! + 1);
			}
		}
		for (let i = 0; i < NUM_POINTS; i++) {
			if (this.meshSizesList.get(i)) {
				log(`\tSeed ${i} mapped ${this.mappedMeshSizesList.get(i)} of ${this.meshSizesList.get(i)} points.`);
			}
		}

		// Save seeds to disk.
		this.points2DList.saveAsBin(fileParams.OUTPUT_PATH, `${fileParams.FILENAME}_points2DList`);
		this.iterMappedList.saveAsBin(fileParams.OUTPUT_PATH, `${fileParams.FILENAME}_iterMappedList`);
	}

	private _getDist3D(index1: number, index2: number) {
		const point1 = this.points3DList.getVector3(index1, _getDist3D_tempVector1);
		const point2 = this.points3DList.getVector3(index2, _getDist3D_tempVector2);
		return point1!.sub(point2!).length();
	}

	private _getDistSq3D(index1: number, index2: number) {
		const point1 = this.points3DList.getVector3(index1, _getDistSq3D_tempVector1);
		const point2 = this.points3DList.getVector3(index2, _getDistSq3D_tempVector2);
		return point1!.sub(point2!).lengthSq();
	}

	private _checkErrorTolsOnEachEdge(position2D: number[], constraintData: Float32Array, NUM_CONSTRAINTS: number) {
		for (let i = 0; i < NUM_CONSTRAINTS; i++) {
			const diffX = position2D[0] - constraintData[3 * i];
			const diffY = position2D[1] - constraintData[3 * i + 1];
			// Calc percent error of each edge.
			const nominalLength = Math.sqrt(constraintData[3 * i + 2]);
			const error = Math.sqrt(diffX*diffX + diffY*diffY) - nominalLength;
			if (error > this.flatteningParams.FLATTENING_EDGE_LENGTH_ERROR_TOL * nominalLength) {
				return false;
			}
		}
		return true;
	}

	private _BFGS(initialPosition: number[], constraintData: Float32Array, NUM_CONSTRAINTS: number) {
		const result = this.bfgs.run(initialPosition, constraintData, NUM_CONSTRAINTS);
		if (result === null) {
			console.log('BFGS failed.')
			return null;
		}

		if (!this._checkErrorTolsOnEachEdge(result, constraintData, NUM_CONSTRAINTS)) {
			return null;
		};
		return result;
	}

	private _savePoint2D(i: number, position2D: number[], meshNumber: number) {
		// Save 2d position.
		this.points2DList.set(i, position2D);
		// this.mappedMeshSizesList.set(meshNumber, this.mappedMeshSizesList.get(meshNumber)! + 1);
		// Keep track of when this point was added to 2D.
		this.iterMappedList.set(i, this.iterNum);
	}
	
	private _seedMesh(meshNumber: number, enforceHighQuality = true, startIndex = 0) {
		const NUM_POINTS = this.points3DList.getLength();
		// Grab first point of meshNumber.
		let point1Index: number | null = null;
		for (let i = startIndex; i < NUM_POINTS ; i++) {
			if (this.meshNumbersList.get(i) === meshNumber) {
				const neighbors = this.meshNeighborsList.get(i, tempArray1);
				if (neighbors === null) {
					continue;
				}
				if (enforceHighQuality) {
					// Limit seed search to only points with 8 neighbors, these tend to be higher quality.
					if (!neighbors || neighbors.length !== 8) {
						continue;
					}
				}
				point1Index = i;
				break;
			}
		}
		if (point1Index === null){
			if (enforceHighQuality) {
				// Try again without high quality enforcement.
				this._seedMesh(meshNumber, false);
				return;
			}
			log(`Unable to seed mesh ${meshNumber}`);
			return;
		}

		// Find two neighbors that are neighbors of each other to form remainder of triangle.
		let neighbors = this.meshNeighborsList.get(point1Index, tempArray1)!;
		if (enforceHighQuality) {
			// Filter to neighbors of high quality (eg each with 8 neighbors of their own).
			neighbors = neighbors.filter(i => this.meshNeighborsList.get(i, tempArray2)?.length === 8);
		}
		let triangleFormed = false;
		for (let i = 0; i < neighbors.length; i++) {
			let neighborNeighbors = this.meshNeighborsList.get(neighbors[i], tempArray2);
			if (!neighborNeighbors) continue;
			const intersection = arrayIntersection(neighborNeighbors, neighbors);
			if (intersection.length == 0) {
				continue;
			}
			// Triangle found.
	
			// Put first pt on origin.
			// We don't actually have to do this, bc the value never changes.
			_BFGS_constraintData[0] = 0;
			_BFGS_constraintData[1] = 0;
	
			// Put second pt on x axis.
			const point2Index = neighbors[i];
			const dist12 = this._getDist3D(point1Index, point2Index);
			if (dist12 == 0) {
				console.log("Error calculating distance between neighboring points in seed().");
				continue;
			}
			_BFGS_constraintData[3] = dist12;
			_BFGS_constraintData[4] = 0;
	
			// Solve for third point.
			const point3Index = intersection[0];
			_BFGS_constraintData[2] = this._getDistSq3D(point1Index, point3Index);
			_BFGS_constraintData[5] = this._getDistSq3D(point2Index, point3Index);
			// Start with an estimate of third point.
			_BFGS_initialPosition[0] = dist12 / 2;
			_BFGS_initialPosition[1] = dist12 * SQRT_3;
	
			const result = this._BFGS(_BFGS_initialPosition, _BFGS_constraintData, 2);
			if (result === null) {
				continue;
			}
	
			triangleFormed = true;
	
			// Add 2D points.
			_savePoint2D_position[0] = _BFGS_constraintData[0];
			_savePoint2D_position[1] = _BFGS_constraintData[1];
			this._savePoint2D(point1Index, _savePoint2D_position, meshNumber);
			_savePoint2D_position[0] = _BFGS_constraintData[3];
			_savePoint2D_position[1] = _BFGS_constraintData[4];
			this._savePoint2D(point2Index, _savePoint2D_position, meshNumber);
			this._savePoint2D(point3Index, result, meshNumber);
			break;
		}
	
		if (!triangleFormed){
			// Continue search if possible
			this._seedMesh(meshNumber, enforceHighQuality, point1Index + 1);
			return;
		}
	}
	
	iter() {
		const NUM_POINTS = this.points2DList.getLength();
		// Keep track of num points checked and successfully added this round.
		// let numPtsAddedThisRound = 0;
		let numPtsCheckedThisRound = 0;

		// Run 100 steps of iter before checking if we're done to reduce the number of data transfers needed.
		for (let j = 0; j < 100; j++) {

			if (this.fileParams.SHOULD_SAVE_ANIMATION) {
				// Copy position data to cpu and save.
				this.gpuHelper.copyDataToMutableTypedArray('positions2D', this.points2DList);
				this.points2DList.saveAsBin(`${this.fileParams.OUTPUT_PATH}${this.fileParams.ANIMATION_PATH}`, `${this.fileParams.FILENAME}_points2DList_frame${this.iterNum}`);
			}

			// Increment iterNum.
			this.iterNum += 1;

			// Update mappingAttemptsRemaining.
			this.gpuHelper.setKernelArgument('updateMappingAttemptsRemaining', 4, 'int', this.iterNum);
			this.gpuHelper.runProgram('updateMappingAttemptsRemaining', NUM_POINTS);

			// Add new points.
			this.gpuHelper.setKernelArgument('mapPoints2D', 6, 'int', this.iterNum);
			this.gpuHelper.runProgram('mapPoints2D', NUM_POINTS);

			// Run relaxation simulation.
			const HALF_NUM_STEPS = flatteningParams.NUM_FLATTENING_SIM_STEPS / 2;
			for (let i = 0; i < HALF_NUM_STEPS; i++) {
				// Run two steps of sim.
				this.gpuHelper.setBufferArgument('flatteningSim', 0, 'nextPositions2D');
				this.gpuHelper.setBufferArgument('flatteningSim', 1, 'nextVelocities2D');
				this.gpuHelper.setBufferArgument('flatteningSim', 2, 'positions2D');
				this.gpuHelper.setBufferArgument('flatteningSim', 3, 'velocities2D');
				this.gpuHelper.runProgram('flatteningSim', NUM_POINTS);

				this.gpuHelper.setBufferArgument('flatteningSim', 0, 'positions2D');
				this.gpuHelper.setBufferArgument('flatteningSim', 1, 'velocities2D');
				this.gpuHelper.setBufferArgument('flatteningSim', 2, 'nextPositions2D');
				this.gpuHelper.setBufferArgument('flatteningSim', 3, 'nextVelocities2D');
				this.gpuHelper.runProgram('flatteningSim', NUM_POINTS);
			}
		}

		// Check to see how many points were checked this round.
		// Copy data back into CPU.
		this.gpuHelper.copyDataToMutableTypedArray('mappingAttemptsRemaining', this.mappingAttemptsRemainingList);
		for (let i = 0; i < NUM_POINTS; i++) {
			if (this.mappingAttemptsRemainingList.get(i)! > 0) {
				numPtsCheckedThisRound++;
			}
		}
		// console.log(numPtsCheckedThisRound);

		// log(`\t${numPtsAddedThisRound} points mapped to 2D this round.`);

		if (numPtsCheckedThisRound === 0) {
			return false;
		}
		return true;
	}


    destroy() {
    }
}