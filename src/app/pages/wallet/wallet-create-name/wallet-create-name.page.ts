import { Component, OnInit } from '@angular/core';
import { Native } from '../../../services/native.service';
import { Config } from '../../../config/Config';
import { Util } from '../../../model/Util';
import { ActivatedRoute } from '@angular/router';
import { WalletManager } from 'src/app/services/wallet.service';
import { WalletCreationService } from 'src/app/services/walletcreation.service';

@Component({
    selector: 'app-wallet-create-name',
    templateUrl: './wallet-create-name.page.html',
    styleUrls: ['./wallet-create-name.page.scss'],
})
export class WalletCreateNamePage implements OnInit {
    public name: string = "";
    constructor(public route: ActivatedRoute, public native: Native, private walletManager: WalletManager, private walletCreationService: WalletCreationService) {
    }

    ngOnInit() {
        console.log('ngOnInit WalletCreateNamePage');
    }

    import() {
        if (this.checkParms()) {
            this.walletCreationService.name = this.name;
            this.native.go("/addpublickey");
        }
    }

    checkParms() {
        if (Util.isNull(this.name)) {
            this.native.toast_trans("text-wallet-name-validator");
            return false;
        }

        if (Util.isWalletName(this.name)) {
            this.native.toast_trans("text-wallet-name-validator1");
            return;
        }

        if (this.walletManager.walletNameExists(this.name)) {
            this.native.toast_trans("text-wallet-name-validator2");
            return;
        }

        return true;
    }

}
