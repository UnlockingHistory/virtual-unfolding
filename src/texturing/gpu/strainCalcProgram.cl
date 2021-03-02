// Computes strain of each vertex in 2D mesh.

__kernel void strainCalc(
	__global __write_only float *vertexStrains,
	__global __read_only float *positions2D,
    __global __read_only float *positions3D,
	__global __read_only int *neighbors
) {
    const size_t i =  get_global_id(0);

    const float2 position2D = {positions2D[2*i], positions2D[2*i + 1]};
    const float4 position3D = {positions3D[3*i], positions3D[3*i + 1], positions3D[3*i + 2], 0};

    float strain = 0.0f;
    int numNeighbors = 0;
    for (int j = 0; j < MAX_NUM_NEIGHBORS; j++) {
        const int neighbor = neighbors[MAX_NUM_NEIGHBORS * i + j];
        if (neighbor == NULL_INT32) {
            break;
        }
        const float2 neighborPosition2D = {positions2D[2*neighbor], positions2D[2*neighbor + 1]};
        const float4 neighborPosition3D = {positions3D[3*neighbor], positions3D[3*neighbor + 1], positions3D[3*neighbor + 2], 0};

        const float nominalLength = length(neighborPosition3D - position3D);
        strain += fabs((length(neighborPosition2D - position2D) - nominalLength) / nominalLength);
        numNeighbors++;
    }

    vertexStrains[i] = strain / convert_float(numNeighbors);
}
