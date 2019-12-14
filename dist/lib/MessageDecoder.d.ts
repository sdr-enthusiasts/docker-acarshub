import { DecoderPluginInterface } from './DecoderPluginInterface';
export declare class MessageDecoder {
    plugins: Array<DecoderPluginInterface>;
    constructor();
    registerPlugin(plugin: DecoderPluginInterface): boolean;
    decode(message: any): any;
    decodeMessage(message: any): string;
    lookupAirportByIata(iata: string): any;
}
declare const _default: {};
export default _default;
