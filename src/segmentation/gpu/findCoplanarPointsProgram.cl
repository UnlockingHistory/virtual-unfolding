#import "src/common/gpu/utils.cl"

__kernel void findCoplanarPoints(
	__global write_only int *neighbors,
	__global read_only float *points,
	__global read_only int *indices,
	__global read_only float *normals,
	__global read_only uchar *flags,
	__global read_only int *size
) {
    const size_t i =  get_global_id(0);

	// Don't mesh flagged points.
	if (flags[i]) {
		return;
	}
    const float3 currentPoint = {points[3 * i], points[3 * i + 1], points[3 * i + 2]};
    const float3 currentNormal = {normals[3 * i], normals[3 * i + 1], normals[3 * i + 2]};

	const int3 index3D = calcIndex3DFromPosition3D(currentPoint);
	if (!index3DInBounds(index3D, size)) {
		return;
	}
	const int index1D = calcIndex1DFromIndex3D(index3D, size);
	if (indices[index1D] != convert_int(i)) {
		// printf("Bad index for point.");
		return;
	}

    // Check against all neighboring points
    int numNeighbors = 0;
    int pointNeighbors[NUM_NEIGHBORING_CELLS];
    float pointNeighborsDistSq[NUM_NEIGHBORING_CELLS];
    for (int z = -WINDOW_SIZE; z <= WINDOW_SIZE; z++) {
        for (int y = -WINDOW_SIZE; y <= WINDOW_SIZE; y++) {
            for (int x = -WINDOW_SIZE; x <= WINDOW_SIZE; x++) {
                if (x == 0 && y == 0 && z == 0) {
                    continue;
                }
                const int3 offset = {x, y, z};
                const int3 neighborIndex3D = index3D + offset;
                if (!index3DInBounds(neighborIndex3D, size)) {
                    continue;
                }

                const int neighborIndex = indices[calcIndex1DFromIndex3D(neighborIndex3D, size)];
                if (neighborIndex == NULL_INT32) {
                    continue;
                }

				// Don't mesh flagged points.
				if (flags[neighborIndex]) {
					continue;
				}
                const float3 neighborPos = {points[3 * neighborIndex], points[3 * neighborIndex + 1], points[3 * neighborIndex + 2]};
                const float3 displacement = neighborPos - currentPoint;

                // Check that points are not too far apart.
                const float distSq = dot(displacement, displacement);
                if (distSq > MAX_EDGE_LENGTH_SQ) {
                    continue;
                }

                // Check that normals are aligned within tolerance.
                float3 neighborNormal = {normals[3 * neighborIndex], normals[3 * neighborIndex + 1], normals[3 * neighborIndex + 2]};
				const float dotProdNormals = dot(neighborNormal, currentNormal);
                if (fabs(dotProdNormals) < COS_MESHING_NORMAL_ALIGNMENT_TOL) {
                    continue;
                }
				// Fix sign of normal if needed.
                if (dotProdNormals < 0) {
                    neighborNormal *= -1.0f;
                }

                // Calc average normal.
                const float3 averageNormal = (currentNormal + neighborNormal) / 2.0f;

                // Check that points are orthogonal to average normal.
                const float3 edgeVec = normalize(displacement);
                const float cosAngle = dot(averageNormal, edgeVec);
                if (fabs(cosAngle) > COS_MESHING_EDGE_NORMAL_ORTHOG_TOL) {
                    continue;
                }

                pointNeighbors[numNeighbors] = neighborIndex;
                pointNeighborsDistSq[numNeighbors] = distSq;
                numNeighbors++;
            }
        }
    }

    // Sort neighbors by distance.
    sortAscending(pointNeighborsDistSq, pointNeighbors, numNeighbors);

    // Set output.
    if (numNeighbors > MAX_NUM_NEIGHBORS) {
        numNeighbors = MAX_NUM_NEIGHBORS;
    }
    for (int j = 0; j < numNeighbors; j++) {
        neighbors[MAX_NUM_NEIGHBORS * i + j] = pointNeighbors[j];
    }
}