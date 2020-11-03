import { Component } from '@angular/core';
import { ModalController, Events } from '@ionic/angular';
import { Native } from '../../../../services/native.service';
import { PopupProvider} from '../../../../services/popup.service';
import { WalletManager } from '../../../../services/wallet.service';
import { MasterWallet } from 'src/app/model/wallets/MasterWallet';
import { AppService } from 'src/app/services/app.service';
import { Util } from 'src/app/model/Util';
import { TranslateService } from '@ngx-translate/core';
import { Router } from '@angular/router';
import { ThemeService } from 'src/app/services/theme.service';

@Component({
    selector: 'app-coin-address',
    templateUrl: './coin-address.page.html',
    styleUrls: ['./coin-address.page.scss'],
})

export class CoinAddressPage {

    addressList = [];
    private masterWallet: MasterWallet = null;
    public masterWalletId: string;
    public chainId: string;
    curCount = 0;

    constructor(
        public walletManager: WalletManager,
        public popupProvider: PopupProvider,
        private appService: AppService,
        public native: Native,
        public modalCtrl: ModalController,
        public events: Events,
        public router: Router,
        public theme: ThemeService,
        private translate: TranslateService,
    ) {
        this.init();
    }

    init() {
        const navigation = this.router.getCurrentNavigation();
        if (!Util.isEmptyObject(navigation.extras.state)) {
            // General Values
            this.masterWalletId = navigation.extras.state.masterWalletId;
            this.chainId = navigation.extras.state.chainId;
            this.getAddressList(null);
        }
    }

    ionViewWillEnter() {
        console.log('---- coin-address ionViewWillEnter addressList:', this.addressList)
        // this.appService.setBackKeyVisibility(true);
        this.appService.setTitleBarTitle(this.translate.instant("coin-address-title"));
    }

    async getAddressList(infiniteScroll: any) {
        const allAddresses = await this.walletManager.spvBridge.getAllAddresses(this.masterWalletId, this.chainId, this.curCount, false);
        const addresses = allAddresses['Addresses'];
        const maxCount = allAddresses['MaxCount'];
        let disabled = true;
        if (addresses) {
            if (this.curCount !== 0) {
                this.addressList = this.addressList.concat(addresses);
            } else {
                this.addressList = addresses;
            }

            this.curCount = this.curCount + 20;
            if (this.curCount < maxCount) {
                disabled = false;
            }
        }

        if (infiniteScroll != null) {
            infiniteScroll.complete();
            infiniteScroll.disabled = disabled;
        }
        if (disabled) {
            this.native.toast_trans('coin-address-load-finish');
        }
    }

    copyToClipboard(address) {
        this.native.copyClipboard(address);
        this.native.toast_trans('copied');
    }

    doInfinite(event) {
        setTimeout(() => {
            this.getAddressList(event.target);
        }, 500);
    }
}
