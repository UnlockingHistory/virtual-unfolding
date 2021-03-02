__kernel void clip(
	__global __read_only uchar *input,
	__global __write_only uchar *output
) {
    const size_t i =  get_global_id(0);

    uchar val = input[i];
    if (val > CLIP_VAL) {
        val = CLIP_VAL;
    }

    output[i] = val;
}