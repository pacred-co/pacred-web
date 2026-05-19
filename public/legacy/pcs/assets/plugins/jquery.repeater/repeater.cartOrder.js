var room = 1;

function addItemProduct() {

    room++;
    var objTo = document.getElementById('addItemProduct')
    var divtest = document.createElement("div");
    divtest.setAttribute("class", "form-group removeclass" + room);
    var rdiv = 'removeclass' + room;
    divtest.innerHTML = '<div class="border-shops box-shadow"> <div class="float-right"><button class="btn btn-danger btn-circle" type="button" onclick="removeAddItemProduct(' + room + ');"> <i class="fa fa-minus"></i> </button> </div><div id="" class="p-3"> <div class="form-group"> <div class="mb-1"> <label class="form-control-label" for="cURL[]">' + room + '. ลิงค์สินค้า :</label> <input class="form-control form-control-lg" name="cURL[]" type="text" placeholder="ลิงค์สินค้า" value="" required=""> </div></div><div class="form-group"> <div class="row"> <div class="col-md-6"> <div class="mb-1"> <label class="form-control-label" for="cImages[]">รูปภาพ :</label> <div class="fallback dropify2"> <input type="file" name="cImages[]" class="dropify" accept="image/*" data-max-file-size="5M" /> </div></div></div><div class="col-md-6"> <div class="mb-1"> <label class="form-control-label" for="cDetails[]">หมายเหตุ :</label> <textarea class="form-control" rows="4" name="cDetails[]" placeholder="รายละเอียด" maxlength="1500" ></textarea> </div></div></div></div><div class="form-group"> <div class="row"> <div class="col-md-6"> <div class="mb-1"> <label class="form-control-label" for="cColor[]">สี :</label> <input class="form-control form-control-lg" name="cColor[]" type="text" placeholder="สี" > </div></div><div class="col-md-6"> <div class="mb-1"> <label class="form-control-label" for="cSize[]">ขนาด :</label> <input class="form-control form-control-lg" name="cSize[]" type="text" placeholder="ขนาด" > </div></div></div></div><div class="form-group"> <div class="row"> <div class="col-md-4"> <div class="mb-1"> <label class="form-control-label" for="cPrice[]">ราคา (¥) :</label> <input id="cPrice' + room + '" class="cPrice form-control form-control-lg text-right" name="cPrice[]" type="number" placeholder="0.00(¥)" min="0.01" step="0.01" required=""> </div></div><div class="col-md-4"> <div class="mb-1"> <label class="form-control-label" for="cAmount[]">จำนวน :</label> <input id="cAmount' + room + '" class="cAmount form-control form-control-lg text-right" name="cAmount[]" type="number" value="1" placeholder="1" min="1" max="10000" step="1" pattern="\d*" required=""> </div></div><div class="col-md-4"> <div class="mb-1"> <label class="form-control-label" for="cPriceTotal[]">ราคารวม (¥) :</label> <input id="cPriceTotal' + room + '" class="cPriceTotal form-control form-control-lg text-right" name="cPriceTotal[]" type="text" placeholder="0.00" value="" disabled> </div></div></div></div></div></div><hr/>';

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
                $('#cPriceTotal' + room + '').val(volume.toFixed(3));
            });
        });
        calAmount();
        calTotalPrice();
    });
}

function removeAddItemProduct(rid) {
    $('.removeclass' + rid).remove();
    calAmount();
    calTotalPrice();
}