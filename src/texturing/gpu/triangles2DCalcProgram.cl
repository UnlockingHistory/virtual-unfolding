// Calcs nearest triangle per grid index.
#import "src/common/gpu/utils.cl";

static void checkPosition(
	__global __read_only int *grid2D,
	__global __read_only float *positions2D,
	const float2 gridPosition2D,
	const int2 gridIndex2D,
    const int gridSizeX,
	const int gridSizeY,
    int3 *indices
) {
    if (!index2DInBounds(gridIndex2D, gridSizeX, gridSizeY)) {
        return;
    }

    if ((*indices).x != NULL_INT32 && (*indices).y != NULL_INT32 && (*indices).z != NULL_INT32) {
        return;
    }

    const int neighborIndex = grid2D[gridIndex2D.y * gridSizeX + gridIndex2D.x];
    if (neighborIndex != NULL_INT32) {
		// TODO: we could sort to get the closest points, but probably not necessary.
        // // Calculate dist to this neighbor.
        // const float2 neighborPosition = {positions2D[2 * neighborIndex], positions2D[2 * neighborIndex + 1]};
        // const float2 vec = neighborPosition - gridPosition2D;
        // const float dist = dot(vec, vec);

        // Add neighbor to list if possible.
		if ((*indices).x == NULL_INT32) {
			(*indices).x = neighborIndex;
		} else if ((*indices).y == NULL_INT32) {
			(*indices).y = neighborIndex;
		} else if ((*indices).z == NULL_INT32) {
			(*indices).z = neighborIndex;
		}
    }

    if ((*indices).x != NULL_INT32 && (*indices).y != NULL_INT32 && (*indices).z != NULL_INT32) {
        // Calc barycentric coordinates from 2D mesh.
        const float2 p1_2D = {positions2D[2*(*indices).x], positions2D[2*(*indices).x + 1]};
        const float2 p2_2D = {positions2D[2*(*indices).y], positions2D[2*(*indices).y + 1]};
        const float2 p3_2D = {positions2D[2*(*indices).z], positions2D[2*(*indices).z + 1]};
        const float3 barycentric = calcBarycentricCoords(gridPosition2D, p1_2D, p2_2D, p3_2D);
        const float cutoff = -1.0f;
        // The pixel may be slightly outside the triangle, but not too much.
        if (barycentric.x < cutoff) {
            (*indices).x = NULL_INT32;
        }
        if (barycentric.y < cutoff) {
            (*indices).y = NULL_INT32;
        }
        if (barycentric.z < cutoff) {
            (*indices).z = NULL_INT32;
        }
    }
}

__kernel void triangles2DCalc(
	__global __write_only int *triangles2D,
	__global __read_only int *grid2D,
    __global __read_only float *positions2D,
	const int gridSizeX,
	const int gridSizeY,
    const int offsetX,
	const int offsetY
) {
    const size_t i =  get_global_id(0);
    const int2 gridIndex2D = {i % gridSizeX, i / gridSizeX };
    
    const float2 gridOffset = {offsetX, offsetY};
    const float2 gridPosition2D = convert_float2(gridIndex2D) + 0.5f + gridOffset;

    // Init a place to store indices.
    int3 indices = {NULL_INT32, NULL_INT32, NULL_INT32};

    // Check current grid position.
    checkPosition(grid2D, positions2D, gridPosition2D, gridIndex2D,
        gridSizeX, gridSizeY, &indices);
    // Search a radius in the grid2D.
    for (int k = 1; k <= TRIANGLE_SEARCH_RADIUS; k++) {
        for (int j = -k; j <= k; j++) {
            int2 offset1 = {j, -k};
            checkPosition(grid2D, positions2D, gridPosition2D, gridIndex2D + offset1,
                gridSizeX, gridSizeY, &indices);
            int2 offset2 = {j, k};
            checkPosition(grid2D, positions2D, gridPosition2D, gridIndex2D + offset2,
                gridSizeX, gridSizeY, &indices);
            if (j > -k && j < k) {
                int2 offset3 = {-k, j};
                checkPosition(grid2D, positions2D, gridPosition2D, gridIndex2D + offset3,
                    gridSizeX, gridSizeY, &indices);
                int2 offset4 = {k, j};
                checkPosition(grid2D, positions2D, gridPosition2D, gridIndex2D + offset4,
                    gridSizeX, gridSizeY, &indices);
            }
        }
        if (indices.x != NULL_INT32 && indices.y != NULL_INT32 && indices.z != NULL_INT32) {
            triangles2D[3 * i] = indices.x;
            triangles2D[3 * i + 1] = indices.y;
            triangles2D[3 * i + 2] = indices.z;
            return;
        }
    }
}
