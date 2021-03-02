#import "src/common/gpu/utils.cl"
#import "src/flattening/gpu/bfgs.cl"

static int appendNeighbors(
	__global __read_only float *positions2D,
	__global __read_only int *neighbors,
	__global __read_only int *iterMapped,
	int allNeighbors[MAX_BFGS_CONSTRAINTS],
	volatile int numAllNeighbors,
	const int lastRing[MAX_BFGS_CONSTRAINTS],
	const int numLastRing, 
	int nextRing[MAX_BFGS_CONSTRAINTS],
	const int iterNum
) {
	volatile int numNextRing = 0;
	for (int j = 0; j < numLastRing; j++) {
		const int lastRingIndex = lastRing[j];
		for (int k = 0; k < MAX_NUM_NEIGHBORS; k++) {
			if (numAllNeighbors == MAX_BFGS_CONSTRAINTS) {
				return numNextRing;
			}
			const int neighborIndex = neighbors[MAX_NUM_NEIGHBORS * lastRingIndex + k];
			if (neighborIndex == NULL_INT32) {
				break;
			}
			// Check that this neighbor is mapped to 2D.
			if (positions2D[2 * neighborIndex] == NULL_FLOAT32 || positions2D[2 * neighborIndex + 1] == NULL_FLOAT32) {
				continue;
			}
			// Check that neighber wasn't added this round (hasn't undergone sim relaxation).
			if (iterMapped[neighborIndex] == iterNum) {
				continue;
			}
			// Check that we haven't already added this neighbor to allNeighbors.
			bool alreadyAdded = false;
			for (int i = 0; i < numAllNeighbors; i++) {
				if (allNeighbors[i] == neighborIndex) {
					alreadyAdded = true;
					break;
				}
			}
			if (alreadyAdded) {
				continue;
			}
			// TODO: check mesh number in mesh merging mode.
			allNeighbors[numAllNeighbors] = neighborIndex;
			numAllNeighbors++;
			nextRing[numNextRing] = neighborIndex;
			numNextRing++;
		}
	}
	return numNextRing;
}

__kernel void mapPoints2D(
    __global __read_write float *positions2D,
	__global __read_only float *positions3D,
    __global __read_only int *neighbors,
	__global __read_only int *meshNumbers,
	__global __read_only uchar *mappingAttemptsRemaining,
	__global __read_write int *iterMapped,
	const int iterNum
) {
	const size_t i =  get_global_id(0);

	uchar numAttempts = mappingAttemptsRemaining[i];
	if (numAttempts == 0) {
		// This is not a point to add next.
		return;
	}

	// Init a place to store all neighbor indices.
	int allNeighbors[MAX_BFGS_CONSTRAINTS];
	int numAllNeighbors = 0;
	int lastRing[MAX_BFGS_CONSTRAINTS];
	lastRing[0] = i;
	int numLastRing = 1;
	int nextRing[MAX_BFGS_CONSTRAINTS];

	const int meshNumber = meshNumbers[i];
	if (meshNumber == NULL_INT32) {
		// This should never happen.
		return;
	}

	// Get first ring neighbors.
	numLastRing = appendNeighbors(positions2D, neighbors, iterMapped, allNeighbors, numAllNeighbors, lastRing, numLastRing, nextRing, iterNum);
	numAllNeighbors += numLastRing;
	
	// Get second ring neighbors.
	numLastRing = appendNeighbors(positions2D, neighbors, iterMapped, allNeighbors, numAllNeighbors, nextRing, numLastRing, lastRing, iterNum);
	numAllNeighbors += numLastRing;

	if (numAllNeighbors < 5) {
		// Get third ring neighbors.
		numLastRing = appendNeighbors(positions2D, neighbors, iterMapped, allNeighbors, numAllNeighbors, lastRing, numLastRing, nextRing, iterNum);
		numAllNeighbors += numLastRing;
		if (numAllNeighbors < 5) {
			// Get fourth ring neighbors.
			numLastRing = appendNeighbors(positions2D, neighbors, iterMapped, allNeighbors, numAllNeighbors, nextRing, numLastRing, lastRing, iterNum);
			numAllNeighbors += numLastRing;

			if (numAllNeighbors < 3 || (numAllNeighbors < 5 && iterNum < 3)) {
				// Skip this point, not enough neighbors found.
				return;
			}
		}
	}

	// TODO: check for colinearity of allNeighbors.

	float BFGS_constraintData[3 * MAX_BFGS_CONSTRAINTS];
	int numConstraints = numAllNeighbors;
	if (numConstraints > MAX_BFGS_CONSTRAINTS) {
		numConstraints = MAX_BFGS_CONSTRAINTS;
	}
	
	const float3 point3D = { positions3D[3 * i], positions3D[3 * i + 1], positions3D[3 * i + 2] };

	for (int j = 0; j < numConstraints; j++) {
		const int neighborIndex = allNeighbors[j];
		const float2 neighborPoint2D = { positions2D[2 * neighborIndex], positions2D[2 * neighborIndex + 1] };
		BFGS_constraintData[3 * j] = neighborPoint2D.x;
		BFGS_constraintData[3 * j + 1] = neighborPoint2D.y;
		const float3 neighborPoint3D = { positions3D[3 * neighborIndex], positions3D[3 * neighborIndex + 1], positions3D[3 * neighborIndex + 2] };
		const float3 diff = neighborPoint3D - point3D;
		BFGS_constraintData[3 * j + 2] = dot(diff, diff); // Dist sq.
	}
	
	const float2 initialPosition = { BFGS_constraintData[0], BFGS_constraintData[1] };

	const float2 result = BFGS(initialPosition, BFGS_constraintData, numConstraints);
	if (result.x == NULL_FLOAT32) {
		// console.log("BFGS failed", meshNumber, i);
		return;
	}

	// Check that results satisfies error tols.
	for (int j = 0; j < numConstraints; j++) {
		float2 neighborPosition = { BFGS_constraintData[3 * j], BFGS_constraintData[3 * j + 1] };
		float2 diff = result - neighborPosition;
		// Calc percent error of each edge.
		float nominalLength = sqrt(BFGS_constraintData[3 * j + 2]);
		float error = length(diff) - nominalLength;
		if (error > FLATTENING_EDGE_LENGTH_ERROR_TOL * nominalLength) {
			return;
		}
	}

	// Save 2d position.
	// TODO: can we set this atomically?
	positions2D[2 * i] = result.x;
	positions2D[2 * i + 1] = result.y;
	iterMapped[i] = iterNum; // Keep track of when this point was added to 2D.
}
