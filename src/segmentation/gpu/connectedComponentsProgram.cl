
__kernel void iterConnections(
	__global __read_write int *meshNumbers,
	__global __read_only int *meshNeighbors
) {
    const size_t i =  get_global_id(0);

    int currentMeshNumber = meshNumbers[i];
    if (currentMeshNumber == NULL_INT32) {
        return;
    }

    for (int j = 0; j < MAX_NUM_NEIGHBORS; j++) {
        const int neighbor = meshNeighbors[i * MAX_NUM_NEIGHBORS + j];
        if (neighbor == NULL_INT32) {
            break;
        }
        const int neighborMeshNumber = meshNumbers[neighbor];
        if (neighborMeshNumber < currentMeshNumber) {
            currentMeshNumber = neighborMeshNumber;
        }
    }

	// Note, this operation is not guarenteed to proceed in a deterministic order in parallel,
	// but should arrive at the same solution no matter the order of the updates.
    meshNumbers[i] = currentMeshNumber;
}

__kernel void findNeighborMeshNums(
	__global __write_only int *adjacentMeshNumbers,
	__global __read_only int *meshNumbers,
	__global int *meshNeighbors
) {
    const size_t i =  get_global_id(0);

    const int currentMeshNumber = meshNumbers[i];
    if (currentMeshNumber == NULL_INT32) {
        return;
    }
    int adjacentMeshNumber = adjacentMeshNumbers[currentMeshNumber];
    const int lastAdjacentMeshNumber = adjacentMeshNumber;

    for (int j = 0; j < MAX_NUM_NEIGHBORS; j++) {
        const int neighbor = meshNeighbors[i * MAX_NUM_NEIGHBORS + j];
        if (neighbor == NULL_INT32) {
            break;
        }
        const int neighborMeshNumber = meshNumbers[neighbor];
        if (neighborMeshNumber < currentMeshNumber && (adjacentMeshNumber == NULL_INT32 || neighborMeshNumber < adjacentMeshNumber)) {
            adjacentMeshNumber = neighborMeshNumber;
        }
    }

    if (adjacentMeshNumber != lastAdjacentMeshNumber) {
        adjacentMeshNumbers[currentMeshNumber] = adjacentMeshNumber;
    }
}