var room = 1;

function addItemProduct2() {

    room++;
    var objTo = document.getElementById('addItemProduct')
    var divtest = document.createElement("div");
    divtest.setAttribute("class", "form-group removeclass" + room);
    var rdiv = 'removeclass' + room;
    divtest.innerHTML = '<div class="border-shops box-shadow"><div class="float-right"><button class="btn btn-danger btn-circle" type="button" onclick="removeAddItemProduct(' + room + ');"> <i class="fa fa-minus"></i> </button> </div> <div id="" class="p-1"> <div class="form-group"> <div class="mb-1"> <label class="form-control-label" for="cURL[]">1. ลิงก์สินค้า :</label> <input class="form-control form-control-lg cURL" name="cURL[]" type="text" placeholder="ลิงก์สินค้า" value="" required=""> </div></div><div class="form-group"> <div class="row"> <div class="col-md-6"> <label class="form-control-label" for="cProvider[]">2. สินค้าจากเว็บไซต์ :</label> <select class="form-control" name="cProvider[]" required=""> <option value="">กรุณาเลือกเว็บจีน...</option> <option value="1" class="text-warning">1688</option> <option value="2" class="text-info">Taobao</option> <option value="3" class="text-danger">Tmall</option> <option value="4" class="text-success">อื่นๆ</option> </select> </div><div class="col-md-6"> <label class="form-control-label" for="cNameShop[]">3. ชื่อร้านค้าจีน :</label> <input class="form-control form-control-lg" name="cNameShop[]" type="text" placeholder="ชื่อร้านค้าจีน" value="" required=""> </div></div></div><div class="form-group"> <div class="mb-1"> <label class="form-control-label" for="cURL[]">4. ชื่อสินค้า :</label> <input class="form-control form-control-lg" name="cURL[]" type="text" placeholder="ชื่อสินค้า" value="" required=""> </div></div><div class="form-group"> <div class="row"> <div class="col-md-7"> <div class="mb-1 result-img-main"> <label class="form-control-label" for="cImages[]">5. ที่อยู่ลิงก์รูปภาพ :</label> <input class="form-control form-control-lg cImages" name="cImages[]" type="text" placeholder="ที่อยู่ลิงก์รูปภาพ" value="" required=""> <a class="result-link image-popup-vertical-fit el-link"> <img class="result-img slide-nav-img img-fluid" src="" style="max-height: 80px;"> </a> </div></div><div class="col-md-5"> <div class="mb-1"> <label class="form-control-label" for="cDetails[]">หมายเหตุ :</label> <textarea class="form-control" rows="5" name="cDetails[]" placeholder="รายละเอียด" maxlength="1500" ></textarea> </div></div></div></div><div class="form-group"> <div class="row"> <div class="col-md-6"> <div class="mb-2"> <label class="form-control-label" for="cColor[]">สี/แบบ :</label> <input class="form-control form-control-lg" name="cColor[]" type="text" placeholder="สี" > </div></div><div class="col-md-6"> <div class="mb-2"> <label class="form-control-label" for="cSize[]">ขนาด :</label> <input class="form-control form-control-lg" name="cSize[]" type="text" placeholder="ขนาด" > </div></div></div></div><div class="form-group"> <div class="row"> <div class="col-md-4"> <div class="mb-2"> <label class="form-control-label" for="cPrice[]">ราคา (¥) :</label> <input id="cPrice' + room + '" class="cPrice form-control form-control-lg text-right" name="cPrice[]" type="number" placeholder="0.00(¥)" min="0.01" step="0.01" required=""> </div></div><div class="col-md-4"> <div class="mb-2"> <label class="form-control-label" for="cAmount[]">จำนวน :</label> <input id="cAmount' + room + '" class="cAmount form-control form-control-lg text-right" name="cAmount[]" type="number" value="1" placeholder="1" min="1" max="10000" step="1" pattern="\d*" required=""> </div></div><div class="col-md-4"> <div class="mb-2"> <label class="form-control-label" for="cPriceTotal[]">ราคารวม (¥) :</label> <input id="cPriceTotal' + room + '" class="cPriceTotal form-control form-control-lg text-right" name="cPriceTotal[]" type="text" placeholder="0.00" value="" disabled> </div></div></div></div></div></div><hr/>';

    objTo.appendChild(divtest)
    $(document).ready(function() {
        $('.dropify').dropify();
        $(document).ready(function() {
            $('#cPrice' + room + '').on('change keyup', function() {
                var volume = ($('#cPrice' + room + '').val() * $('#cAmount' + room + '').val());
                $('#cPriceTotal' + room + '').val(volume.toFixed(3));
            });
            $('#cAmount' + room + '').on('change keyup', function() {
                var volume = ($('#cPrice' + room + '').val() * $('#cAmount' + room + '').val());
                var totalAmountALL = $('#cAmount' + room + '').val();
                $('#cPriceTotal' + room + '').val(volume.toFixed(3));
                $('#totalAmount').html(totalAmountALL);
            });
        });
        calAmount();
        calTotalPrice();        
    });
    $('.result-img-main .cImages').on('change keyup',function() {  
        var srcIMG=$(this).val();
        srcIMG=srcIMG.replace("?x-oss-process=style/alsy", "");
        srcIMG=srcIMG.replace("?x-oss-process=style/tbsy", "");
        srcIMG2=srcIMG+'_150x150.jpg';
        var srcWay=$(this).parent('.result-img-main');
        var srcWay2=$(this).parent('.result-img-main');
        $(srcWay.children().children('.result-img')).attr('src',srcIMG2);
        $(srcWay2.children('.result-link')).attr('href',srcIMG);
    });
}

function removeAddItemProduct(rid) {
    $('.removeclass' + rid).remove();
    calAmount();
    calTotalPrice();
}