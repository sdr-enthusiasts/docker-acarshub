export class IcaoDecoder {
  name : string;
  icao : string;

  constructor(icao: string) {
    this.name = 'icao-decoder-typescript';
    this.icao = icao;
  }

  isMilitary() {
    let i = this.icao;
    return (
      false
      // us military
      //adf7c8-adf7cf = united states mil_5(uf)
      //adf7d0-adf7df = united states mil_4(uf)
      //adf7e0-adf7ff = united states mil_3(uf)
      //adf800-adffff = united states mil_2(uf)
      || i.match(/^adf[7-9]/)
      || i.match(/^adf[a-f]/)
      //ae0000-afffff = united states mil_1(uf)
      || i.match(/^a(e|f)/)

      //010070-01008f = egypt_mil
      || i.match(/^0100(7|8)/)

      //0a4000-0a4fff = algeria mil(ap)
      || i.match(/^0a4/)

      //33ff00-33ffff = italy mil(iy)
      || i.match(/^33ff/)

      //350000-37ffff = spain mil(sp)
      || (i >= '350000' && i <= '37ffff')

      //3a8000-3affff = france mil_1(fs)
      || i.match(/^3a(8|9|[a-f])/)
      //3b0000-3bffff = france mil_2(fs)
      || i.match(/^3b/)

      //3e8000-3ebfff = germany mil_1(df)
      // remove 8 and 9 from mil arnge
      || i.match(/^3e(a|b)/)
      //3f4000-3f7fff = germany mil_2(df)
      //3f8000-3fbfff = germany mil_3(df)
      || i.match(/^3f([4-9]|[a-b])/)

      //400000-40003f = united kingdom mil_1(ra)
      || i.match(/^4000[0-3]/)
      //43c000-43cfff = united kingdom mil(ra)
      || i.match(/^43c/)

      //444000-447fff = austria mil(aq)
      || (i.match(/^44[4-7]/) && i != '447ac7')

      //44f000-44ffff = belgium mil(bc)
      || i.match(/^44f/)

      //457000-457fff = bulgaria mil(bu)
      || i.match(/^457/)

      //45f400-45f4ff = denmark mil(dg)
      || i.match(/^45f4/)

      //468000-4683ff = greece mil(gc)
      || i.match(/^468[0-3]/)

      //473c00-473c0f = hungary mil(hm)
      || i.match(/^473c0/)

      //478100-4781ff = norway mil(nn)
      || i.match(/^4781/)
      //480000-480fff = netherlands mil(nm)
      || i.match(/^480/)
      //48d800-48d87f = poland mil(po)
      || i.match(/^48d8[0-7]/)
      //497c00-497cff = portugal mil(pu)
      || i.match(/^497c/)
      //498420-49842f = czech republic mil(ct)
      || i.match(/^49842/)

      //4b7000-4b7fff = switzerland mil(su)
      || i.match(/^4b7/)
      //4b8200-4b82ff = turkey mil(tq)
      || i.match(/^4b82/)

      //506f00-506fff = slovenia mil(sj)
      || i.match(/^506f/)

      //70c070-70c07f = oman mil(on)
      || i.match(/^70c07/)

      //710258-71025f = saudi arabia mil_1(sx)
      //710260-71027f = saudi arabia mil_2(sx)
      //710280-71028f = saudi arabia mil_3(sx)
      //710380-71039f = saudi arabia mil_4(sx)
      || i.match(/^7102[5-8]/)
      || i.match(/^7103[8-9]/)

      //738a00-738aff = israel mil(iz)
      || i.match(/^738a/)

      //7c822e-7c822f = australia mil_1(av)
      //7c8230-7c823f = australia mil_2(av)
      //7c8240-7c827f = australia mil_3(av)
      //7c8280-7c82ff = australia mil_4(av)
      //7c8300-7c83ff = australia mil_5(av)
      //7c8400-7c87ff = australia mil_6(av)
      //7c8800-7c8fff = australia mil_7(av)
      || i.match(/^7c8([2-4]|8)/)
      //7c9000-7c9fff = australia mil_8(av)
      //7ca000-7cbfff = australia mil_9(av)
      || (i >= '7c9000' && i <= '7cbfff')
      //7cc000-7cffff = australia mil_10(av) 7cc409 not mil, remove this range
      //7d0000-7dffff = australia mil_11(av)
      //7e0000-7fffff = australia mil_12(av)
      || i.match(/^7[d-f]/)

      //800200-8002ff = india mil(im)
      || i.match(/^8002/)

      //c20000-c3ffff = canada mil(cb)
      || i.match(/^c[2-3]/)

      //e40000-e41fff = brazil mil(bq)
      || i.match(/^e4[0-1]/)

      //e80600-e806ff = chile mil(cq)
      || i.match(/^e806/)
    );
  }

}

export default {
};
