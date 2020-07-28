import { Component, OnInit } from '@angular/core';
import { Events } from '@ionic/angular';
import { WalletManager } from '../../../services/wallet.service';
import { Native } from '../../../services/native.service';
import { MasterWallet } from 'src/app/model/MasterWallet';
import { WalletEditionService } from 'src/app/services/walletedition.service';
import { AppService } from 'src/app/services/app.service';

@Component({
    selector: 'app-wallet-manager',
    templateUrl: './wallet-manager.page.html',
    styleUrls: ['./wallet-manager.page.scss'],
})
export class WalletManagerPage implements OnInit {

    constructor(
        public events: Events, public native: Native,
        private appService: AppService,
        private walletEditionService: WalletEditionService,
        public walletManager: WalletManager
    ) {
    }

    ngOnInit() {
    }

    ionViewWillEnter() {
        this.appService.setTitleBarTitle('My Wallets');
    }

    onNext() {
        this.native.go("/launcher");
    }

    itemSelected(masterWallet: MasterWallet) {
        this.walletEditionService.modifiedMasterWalletId = masterWallet.id;
        this.native.go("/wallet-settings");
    }

    getWalletsList(): MasterWallet[] {
        return Object.values(this.walletManager.masterWallets);
    }
}
