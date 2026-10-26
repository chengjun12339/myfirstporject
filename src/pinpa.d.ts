import 'pinia'

declare module 'pinia' {
  export interface DefineStoreOptionsBase<S, Store> {
    // 根据你的插件版本，persist 可能是一个布尔值或配置对象
    persist?: boolean | { [key: string]: any }
  }
}