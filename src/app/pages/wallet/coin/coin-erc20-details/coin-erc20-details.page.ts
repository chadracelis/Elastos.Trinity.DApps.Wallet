import { Component, OnInit } from '@angular/core';
import { ThemeService } from 'src/app/services/theme.service';
import { Native } from 'src/app/services/native.service';
import { TranslateService } from '@ngx-translate/core';
import { Util } from 'src/app/model/Util';
import { Router } from '@angular/router';
import { ERC20Coin } from 'src/app/model/Coin';
import { AppService } from 'src/app/services/app.service';
import { CoinService } from 'src/app/services/coin.service';
import { PopupProvider } from 'src/app/services/popup.service';
import { MasterWallet } from 'src/app/model/wallets/MasterWallet';
import { WalletManager } from 'src/app/services/wallet.service';
import { WalletEditionService } from 'src/app/services/walletedition.service';
import { SubWallet } from 'src/app/model/wallets/SubWallet';

declare let appManager: AppManagerPlugin.AppManager;

@Component({
  selector: 'app-coin-erc20-details',
  templateUrl: './coin-erc20-details.page.html',
  styleUrls: ['./coin-erc20-details.page.scss'],
})
export class CoinErc20DetailsPage implements OnInit {

  private masterWallet: MasterWallet = null;
  private subWallet: SubWallet = null;
  public coin: ERC20Coin;
  public contractAddress: string = '1234';
  public canDelete: boolean = false;

  public Util = Util;

  constructor(
    private appService: AppService,
    public theme: ThemeService,
    private native: Native,
    private translate: TranslateService,
    private router: Router,
    private coinService: CoinService,
    private popupProvider: PopupProvider,
    private walletManager: WalletManager,
    private walletEditionService: WalletEditionService
  ) { }

  ngOnInit() {
    const navigation = this.router.getCurrentNavigation();
    if (!Util.isEmptyObject(navigation.extras.state)) {
        this.coin = navigation.extras.state.coin;
        this.masterWallet = this.walletManager.getMasterWallet(this.walletEditionService.modifiedMasterWalletId);
        this.subWallet = this.masterWallet.getSubWallet(this.coin.getID());

        console.log('ERC20 Masterwallet', this.masterWallet);
        console.log('ERC20 Subwallet', this.subWallet);
        console.log('ERC20 Details', this.coin);

        if (this.coin.coinIsCustom() || this.subWallet && !this.subWallet.getDisplayBalance().isZero()) {
          this.canDelete = true;
        }

        this.contractAddress = this.coin.getContractAddress();
        this.appService.setTitleBarTitle(this.coin.getName());
    }
  }

  ionViewWillLeave() {
    if (this.popupProvider.alertPopup) {
      this.popupProvider.alertCtrl.dismiss();
      this.popupProvider.alertPopup = null;
    }
  }

  copy() {
    this.native.copyClipboard(this.contractAddress);
    this.native.toast(this.translate.instant("copied"));
  }

  async delete() {
    this.popupProvider.ionicConfirm('delete-coin-confirm-title', 'delete-coin-confirm-subtitle')
      .then(async (data) => {
        if (data) {
          await this.coinService.deleteERC20Coin(this.coin);
          this.native.pop();
        }
    });
  }

  share() {
    console.log('Sending "share" intent for', this.coin);

    const addCoinUrl =
      "https://wallet.elastos.net/addcoin?contract=" +
      encodeURIComponent(this.contractAddress);

    appManager.sendIntent("share", {
      title: this.translate.instant("share-erc20-token"),
      url: addCoinUrl,
    });
  }
}
