import { Injectable } from '@angular/core';
import { SubWallet } from '../model/SubWallet';
import { StandardCoinName } from '../model/Coin';
import * as moment from 'moment';

@Injectable({
  providedIn: 'root'
})
export class UiService {

  constructor() { }

  getSubWalletIcon(subwallet: SubWallet): string {
    switch (subwallet.id) {
        case StandardCoinName.ELA:
            return "assets/coins/ela-black.svg";
        case StandardCoinName.IDChain:
            return "assets/coins/ela-turquoise.svg";
        case StandardCoinName.ETHSC:
            return "assets/coins/ela-gray.svg";
        default:
            return "assets/coins/eth.svg";
    }
  }

  getSubwalletTitle(subwallet: SubWallet): string {
      return subwallet.getFriendlyName();
  }

  getSubwalletSubtitle(subwallet: SubWallet): string {
    return subwallet.getDisplayTokenName();
  }

  getFixedBalance(balance: number): string {
    if (balance === 0) {
      return String(0);
    } else {
      return balance.toFixed(4);
    }
  }

  getSyncDate(timestamp) {
    return moment(new Date(timestamp)).format();
  }
}
