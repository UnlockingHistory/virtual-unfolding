#import "src/common/gpu/utils.cl"

__kernel void triangleMeshBuilder(
	__global __write_only float *triangleMeshPositions3D,
    __global __read_only float *positions3D,
	__global __read_only float *barycentrics,
	__global __read_only int *triangles2D
) {
    const size_t i =  get_global_id(0);

	// Set default value;
	triangleMeshPositions3D[3 * i] = NULL_FLOAT32;
    triangleMeshPositions3D[3 * i + 1] = NULL_FLOAT32;
    triangleMeshPositions3D[3 * i + 2] = NULL_FLOAT32;

    const int3 triangle = {triangles2D[3*i], triangles2D[3*i + 1], triangles2D[3*i + 2]};
    if (triangle.x == NULL_INT32) {
        return;
    }
    const float3 barycentric = {barycentrics[3*i], barycentrics[3*i + 1], barycentrics[3*i + 2]};

    // Calc 3D position from 3D mesh.
    const float3 p1_3D = {positions3D[3*triangle.x], positions3D[3*triangle.x + 1], positions3D[3*triangle.x + 2]};
    const float3 p2_3D = {positions3D[3*triangle.y], positions3D[3*triangle.y + 1], positions3D[3*triangle.y + 2]};
    const float3 p3_3D = {positions3D[3*triangle.z], positions3D[3*triangle.z + 1], positions3D[3*triangle.z + 2]};
    float3 position3D = interpVectorBarycentric(barycentric, p1_3D, p2_3D, p3_3D);

	// Set position.
	triangleMeshPositions3D[3 * i] = position3D.x;
    triangleMeshPositions3D[3 * i + 1] = position3D.y;
    triangleMeshPositions3D[3 * i + 2] = position3D.z;
}
