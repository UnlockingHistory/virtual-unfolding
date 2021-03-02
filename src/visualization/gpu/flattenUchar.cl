__kernel void flattenAlongX(const __global uchar *input, __global uchar *output,
	const float opacity, const __global int *size)
{
    const size_t i =  get_global_id(0);

	const int y = i % size[1];
	const int z = i / size[1];

	float sum = 0.0;
	for (int x = 0; x < size[0]; x++) {
		const int index = z * size[0] * size[1] + y * size[0] + x;
		sum += opacity * convert_float(input[index]);
	}

    if (sum > 255) {
        sum = 255;
    }
    output[i] = convert_uchar(sum);
}

__kernel void flattenAlongY(const __global uchar *input, __global uchar *output,
	const float opacity, const __global int *size)
{
    const size_t i =  get_global_id(0);

	const int x = i % size[0];
	const int z = i / size[0];

	float sum = 0.0;
	for (int y = 0; y < size[1]; y++) {
		const int index = z * size[0] * size[1] + y * size[0] + x;
		sum += opacity * convert_float(input[index]);
	}

    if (sum > 255) {
        sum = 255;
    }
    output[i] = convert_uchar(sum);
}

__kernel void flattenAlongZ(const __global uchar *input, __global uchar *output,
	const float opacity, const __global int *size)
{
    const size_t i =  get_global_id(0);

	float sum = 0.0;
	for (int z = 0; z < size[2]; z++) {
		const int index = z * size[0] * size[1] + i;
		sum += opacity * convert_float(input[index]);
	}

    if (sum > 255) {
        sum = 255;
    }
    output[i] = convert_uchar(sum);
}