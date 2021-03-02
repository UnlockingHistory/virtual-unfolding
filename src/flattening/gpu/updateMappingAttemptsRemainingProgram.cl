// Update mapping attempts remaining so that we check neighbors of newly mapped points.

__kernel void updateMappingAttemptsRemaining(
    __global __read_only float *positions2D,
    __global __read_only int *neighbors,
	__global __read_write uchar *mappingAttemptsRemaining,
	__global __read_only int *iterMapped,
	const int iterNum
) {
	const size_t i =  get_global_id(0);
	const uchar numAttempts = mappingAttemptsRemaining[i];
	// Check if point has already been mapped.
	if (positions2D[2 * i] != NULL_FLOAT32 && numAttempts != 0) {
		mappingAttemptsRemaining[i] = 0;
	} else if (numAttempts > 0) {
		// Decrement the number of mapping attempts.
		mappingAttemptsRemaining[i] = numAttempts - 1;
	}

	// Next propagate MAX_NUM_MAPPING_ATTEMPTS to neighbors of newly added points.

	// Check that point was added last round.
	if (iterMapped[i] != iterNum - 1) {
		return;
	}

	// Set all non-mapped neighbors to MAX_NUM_MAPPING_ATTEMPTS in mappingAttemptsRemainingList.
	for (int j = 0; j < MAX_NUM_NEIGHBORS; j++) {
		const int neighborIndex = neighbors[MAX_NUM_NEIGHBORS * i + j];
		if (neighborIndex == NULL_INT32) {
			break;
		}
		if (positions2D[2 * neighborIndex] != NULL_FLOAT32) {
			// This point has already been added.
			continue;
		}
		mappingAttemptsRemaining[neighborIndex] = convert_uchar(MAX_NUM_MAPPING_ATTEMPTS);
	}
}
