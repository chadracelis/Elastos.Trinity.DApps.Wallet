import { Component, OnInit } from '@angular/core';
import { Util } from "../../../services/Util";
import { Config } from '../../../services/Config';
import { NavController, NavParams,ModalController,Events } from '@ionic/angular';
import {WalletManager} from '../../../services/WalletManager';
import {Native} from '../../../services/Native';
import {LocalStorage} from '../../../services/Localstorage';
import { PaymentboxPage } from '../../paymentbox/paymentbox.page';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-payment-confirm',
  templateUrl: './payment-confirm.page.html',
  styleUrls: ['./payment-confirm.page.scss'],
})
export class PaymentConfirmPage implements OnInit {
  masterWalletId:string = "1";
  transfer: any = {
    toAddress: '',
    amount: '',
    memo: '',
    fee: 0,
    payPassword:'',
    remark:'',
  };

  chianId: string = 'ELA';

  feePerKb = 10000;

  rawTransaction: '';

  SELA = Config.SELA;

  txId: string;

  balance: 0;

  information: string;
  constructor(public navCtrl: NavController, public route:ActivatedRoute, public walletManager: WalletManager,
    public native: Native,public localStorage:LocalStorage,public modalCtrl: ModalController,public events :Events ) {
   this.init();
  }

  ngOnInit() {
  }

  init(){
    this.masterWalletId =Config.getCurMasterWalletId();
    this.getAllSubWallets();
    this.route.queryParams.subscribe((data)=>{
      let account = this.GetQueryString("account") || data["account"];
      let toAddress = this.GetQueryString("address") || data["address"];
      let memo = this.GetQueryString("memo") || data["memo"];
      let information = this.GetQueryString("information");
      this.transfer.amount = account;
      this.transfer.toAddress = toAddress;
      this.transfer.memo = memo;
      this.information = information;
    });
  }

  getAllSubWallets(){
    this.walletManager.getAllSubWallets(this.masterWalletId,(data)=>{
      if(data["success"]){
        this.native.info(data);
      }else{
        this.native.info(data);
      }
    })
  }

  GetQueryString(name){
    var reg = new RegExp("(^|&)"+ name +"=([^&]*)(&|$)");
    var r = window.location.search.substr(1).match(reg);
    if(r!=null)return  decodeURI(r[2]); return null;
  }

  onClick(type){
    switch (type) {
      case 1:
        break;
      case 2:   // 转账
        this.checkValue();
        break;
    }
  }

  checkValue() {
    if(Util.isNull(this.transfer.toAddress)){
      this.native.toast_trans('correct-address');
      return;
    }
    if(Util.isNull(this.transfer.amount)){
      this.native.toast_trans('amount-null');
      return;
    }
    if(!Util.number(this.transfer.amount)){
      this.native.toast_trans('correct-amount');
      return;
    }
    if(this.transfer.amount > this.balance){
      this.native.toast_trans('error-amount');
      return;
    }
    this.walletManager.isAddressValid(this.masterWalletId,this.transfer.toAddress, (data) => {
      if (!data['success']) {
        this.native.toast_trans("contact-address-digits");
        return;
      }
      this.native.showLoading().then(()=>{
        this.createTransaction();
      });

    })
  }

  createTransaction(){
    this.walletManager.createTransaction(this.masterWalletId,this.chianId, "",
      this.transfer.toAddress,
      this.transfer.amount,
      this.transfer.memo,
      this.transfer.remark,
      false,
      (data)=>{
        if(data['success']){
          this.native.info(data);
          this.rawTransaction = data['success'];
          this.getFee();
        }else{
          this.native.info(data);
        }
      });
  }

  getFee(){
    this.walletManager.calculateTransactionFee(this.masterWalletId,this.chianId, this.rawTransaction, this.feePerKb, (data) => {
      if(data['success']){
        this.native.info(data);
        this.native.hideLoading();
        this.transfer.fee = data['success'];
        this.openPayModal(this.transfer);
      }else{
        this.native.info(data);
      }
    });
  }

  sendRawTransaction(){

    this.updateTxFee();
  }


  updateTxFee(){
    this.walletManager.updateTransactionFee(this.masterWalletId,this.chianId,this.rawTransaction, this.transfer.fee,"",(data)=>{
                       if(data["success"]){
                        this.native.info(data);
                        this.singTx(data["success"]);
                       }else{
                         this.native.info(data);
                       }
    });
  }

  singTx(rawTransaction){
    this.walletManager.signTransaction(this.masterWalletId,this.chianId,rawTransaction,this.transfer.payPassword,(data)=>{
      if(data["success"]){
        this.native.info(data);
        this.sendTx(data["success"]);
       }else{
         this.native.info(data);
       }
    });
  }

  sendTx(rawTransaction){
    this.native.info(rawTransaction);
    this.walletManager.publishTransaction(this.masterWalletId,this.chianId,rawTransaction,(data)=>{
     if(data["success"]){
       this.native.hideLoading();
       this.native.info(data);
       this.txId = JSON.parse(data['success'])["TxHash"];
       let result = {
         txId: this.txId
       }
       return result;
      }else{
        this.native.info(data);
      }
      this.native.setRootRouter("/tabs");
    })
 }

 openPayModal(data){
   //TODO::
  // let transfer = this.native.clone(data);
  // this.modalCtrl.create(PaymentboxPage/*,transfer*/)
  // .then(modal => modal.onDidDismiss(data => {
  //     if(data){
  //       this.native.showLoading().then(()=>{
  //         this.transfer = this.native.clone(data);
  //         this.sendRawTransaction();
  //       });
  //   }
  // }))
  // .then(modal => modal.present());
}


}
