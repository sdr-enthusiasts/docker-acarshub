export interface DecoderPluginInterface {
  decode(message: any) : any;
  meetsStateRequirements() : boolean;
  // onRegister(store: Store<any>) : void;
  qualifiers() : any;
}

export default {
}
