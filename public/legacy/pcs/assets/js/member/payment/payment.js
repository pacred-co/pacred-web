$('#payYuan').on('change keypress',function() {
    genQR();
});
function genQR(){
    var payYuan = $('#payYuan').val();
    $.ajax({
        url: basePath+"include/pages/payment/QRPay.php?v=" + new Date().getMilliseconds(),
        method: "POST",
        data: { 
            payYuan:payYuan,
        },
        success: function(data) {
            $('.QRPayment').html(data);
        }
    });    
}
$(function(){ 
    "use strict";
    var url = window.location + "";
        var path = url.replace(window.location.protocol + "//" + window.location.host + "/", "");
        //console.log(path);
        var element = $('.pcs-tabs .nav-item a').filter(function() {
            return this.href === url || this.href === path;// || url.href.indexOf(this.href) === 0;
        });
        element.parentsUntil(".main-menu-content").each(function (index)
        {
            if($(this).is("li") && $(this).children("a").length !== 0)
            {
                $(this).children(".nav-item a").addClass("active");
                $(this).parent("ul#main-menu-navigation").length === 0
                    ? $(this).addClass("active")
                    : $(this).addClass("selected");
            } else if(!$(this).is("ul") && $(this).children(" a").length === 0){
                $(this).addClass("selected");
            }else if($(this).is("ul")){
                $(this).addClass('in');
            }                    
        });
    element.addClass("active");
});
function formPay(){    
    var r=confirm("ระบบจะหักเงินจากกระเป๋าสตางค์ของคุณ กรุณายืนยันก่อนทำรายการ");
    if (r==true) {
        $(document).ready(function() { 
            $("#add-payment").modal("hide");
        });
        return true;
    } else {
        return false;
    }
}
$(function () {
    var windowSize = $(window).width();
    if(windowSize >= 450){
        $('#myTable').DataTable({
            aaSorting: [[0, 'desc']],                 
        });
    }else{
        $('#myTable').DataTable({  
            responsive: true,
            aaSorting: [[0, 'desc']], 
        });
    }           
});