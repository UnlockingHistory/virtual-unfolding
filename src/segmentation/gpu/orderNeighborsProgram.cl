#import "src/common/gpu/utils.cl"

__kernel void orderNeighbors(
	__global __read_only float *points,
	__global __read_only float *normals,
	__global __read_write int *neighbors
) {
    const size_t i =  get_global_id(0);

    const float pointX = points[3 * i];
    if (pointX == NULL_FLOAT32) {
        return;
    }
    const float3 point = {pointX, points[3 * i + 1], points[3 * i + 2]};
    const float3 normalRef = {normals[3 * i], normals[3 * i + 1], normals[3 * i + 2]};
    const float3 zAxis = {0, 0, 1};
    const float4 quaternion = quaternionFromUnitVectors(normalRef, zAxis);

    // Get all neighbors and their angles relative to a ref.
    int pointNeighbors[MAX_NUM_NEIGHBORS];
    float angles[MAX_NUM_NEIGHBORS];
    int numNeighbors = 0;
    for (int j = 0; j < MAX_NUM_NEIGHBORS; j++) {
        const int neighborIndex = neighbors[i * MAX_NUM_NEIGHBORS + j];
        if (neighborIndex == NULL_INT32) {
            break;
        }
        numNeighbors++;
        pointNeighbors[j] = neighborIndex;
        // Calc angle of vec to neighbor.
        const float3 neighborPosition = {points[3 * neighborIndex], points[3 * neighborIndex + 1], points[3 * neighborIndex + 2]};
        const float3 vec = applyQuaternion(normalize(neighborPosition - point), quaternion);
        // Calculate each angle with respect to the x-axis
        angles[j] = atan2(vec.y, vec.x);;
   }

	// No neighbors, no change.
	if (numNeighbors == 0) {
		return;
	}

    // Sort neighbors counterclockwise.
    sortAscending(angles, pointNeighbors, numNeighbors);

	// Write ordered neighbors.
    for (int j = 0; j < numNeighbors; j++) {
		neighbors[i * MAX_NUM_NEIGHBORS + j] = pointNeighbors[j];
	}
}