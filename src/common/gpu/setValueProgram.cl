// Sets all elements of a GPU buffer to a given value.

__kernel void setIntValue(__global __write_only int *array, const int value)
{
    const size_t i =  get_global_id(0);
    array[i] = value;
}

__kernel void setFloatValue(__global __write_only float *array, const float value)
{
    const size_t i =  get_global_id(0);
    array[i] = value;
}

__kernel void setUCharValue(__global __write_only uchar *array, const uchar value)
{
    const size_t i =  get_global_id(0);
    array[i] = value;
}
