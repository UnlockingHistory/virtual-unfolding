__kernel void hashMeshPositions(const __global float *positions3D, __global uchar *output,
	const __global int *size)
{
    const size_t i =  get_global_id(0);

	const float3 position = {positions3D[3 * i], positions3D[3 * i + 1], positions3D[3 * i + 2]};
	const int3 index3D = convert_int3(floor(position));
	const int index = index3D.z * size[0] * size[1] + index3D.y * size[0] + index3D.x;

    output[index] = 1;
}