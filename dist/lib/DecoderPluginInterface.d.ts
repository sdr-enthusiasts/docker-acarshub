export interface DecoderPluginInterface {
    decode(message: any): any;
    meetsStateRequirements(): boolean;
    qualifiers(): any;
}
declare const _default: {};
export default _default;
