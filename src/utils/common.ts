// utils/common.ts
export const isNil = (value: any): value is null | undefined => {
    return value == null
}