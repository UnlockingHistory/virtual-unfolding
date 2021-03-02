#import "src/common/gpu/utils.cl"

// Removes any points that are too close to each other.
__kernel void mergePointsByProximity(
	__global __write_only float *points,
	__global __read_only float *pointsCurrentLayer,
    __global __read_only float *pointsPrevLayer,
	__global __read_only int *size
) {
    const size_t i =  get_global_id(0);

    const float3 currentPoint = {pointsCurrentLayer[3 * i], pointsCurrentLayer[3 * i + 1], pointsCurrentLayer[3 * i + 2]};

    // Set default vals.
    points[3 * i] = currentPoint.x;
    points[3 * i + 1] = currentPoint.y;
    points[3 * i + 2] = currentPoint.z;

    if (currentPoint.x == NULL_FLOAT32) {
        return;
    }

    const int2 index2D = calcIndex2DFromIndex1D(i, size);

	// Opencl compiler seems to not like setting the points array or
	// using returns within the for loop.
	// Use the shouldDelete flag instead.
	bool shouldDelete = false;
	// Check against pts in current layer with lower x and y indices.
	const int2 threeNeighborOffset[] = {{-1, -1}, {-1, 0}, {0, -1}};
	for (int j = 0; j < 3; j++) {
		if (shouldDelete) {
			continue;
		}
		const int2 neighborIndex = index2D + threeNeighborOffset[j];
		if (!index2DInBounds(neighborIndex, size[0], size[1])) {
			continue;
		}
		const int neighbor_i = neighborIndex.y * size[0] + neighborIndex.x;
		const float3 neighborPos = {pointsCurrentLayer[3 * neighbor_i], pointsCurrentLayer[3 * neighbor_i + 1], pointsCurrentLayer[3 * neighbor_i + 2]};
		if (neighborPos.x == NULL_FLOAT32) {
			continue;
		}
		const float3 displacement = neighborPos - currentPoint;
		const float distSq = dot(displacement, displacement);
		if (distSq < POINT_DETECTION_MERGE_TOL_SQ) {
			shouldDelete = true;
			continue;
		}
	}

	if (shouldDelete) {
		points[3 * i] = NULL_FLOAT32;
		points[3 * i + 1] = NULL_FLOAT32;
		points[3 * i + 2] = NULL_FLOAT32;
		return;
	}

    // Check against all points in layer below.
	// Iter over nine neighbors in prev layer.
    const int2 nineNeighborOffset[] = {{-1, -1}, {-1, 0}, {-1, 1}, {0, -1}, {0, 0}, {0, 1}, {1, -1}, {1, 0}, {1, 1}};
    for (int j = 0; j < 9; j++) {
		if (shouldDelete) {
			continue;
		}
		const int2 neighborIndex = index2D + nineNeighborOffset[j];
		if (!index2DInBounds(neighborIndex, size[0], size[1])) {
			continue;
		}
		const int neighborI = neighborIndex.y * size[0] + neighborIndex.x;
		const float3 neighborPos = {pointsPrevLayer[3 * neighborI], pointsPrevLayer[3 * neighborI + 1], pointsPrevLayer[3 * neighborI + 2]};
		if (neighborPos.x == NULL_FLOAT32) {
			continue;
		}
		const float3 displacement = neighborPos - currentPoint;
		const float distSq = dot(displacement, displacement);
		if (distSq < POINT_DETECTION_MERGE_TOL_SQ) {
			shouldDelete = true;
			continue;
		}
    }
	
	if (shouldDelete) {
		points[3 * i] = NULL_FLOAT32;
		points[3 * i + 1] = NULL_FLOAT32;
		points[3 * i + 2] = NULL_FLOAT32;
	}
}