$(function() {
    var windowSize = $(window).width();
    if (windowSize >= 450) {
        $('#myTable').DataTable({
            "columnDefs": [
                { "orderable": false, "targets": [3] },
            ]
        });
    } else {
        $('#myTable').DataTable({
            responsive: true,
            "columnDefs": [
                { "orderable": false, "targets": [3] },
                { "targets": [0], "visible": false }
            ]
        });
    }
})

$.Thailand({
    database: basePath+'assets/plugins/jquery.Thailand.js/database/db.json',
    $district: $('#demo1 [name="district"]'),
    $amphoe: $('#demo1 [name="amphoe"]'),
    $province: $('#demo1 [name="province"]'),
    $zipcode: $('#demo1 [name="zipcode"]'),
    onDataFill: function(data) {
        console.info('Data Filled', data);
    },
    onLoad: function() {
        console.info('Autocomplete is ready!');
        $('#loader, .demo').toggle();
    }
});

// watch on change

$('#demo1 [name="district"]').change(function() {
    console.log('ตำบล', this.value);
});
$('#demo1 [name="amphoe"]').change(function() {
    console.log('อำเภอ', this.value);
});
$('#demo1 [name="province"]').change(function() {
    console.log('จังหวัด', this.value);
});
$('#demo1 [name="zipcode"]').change(function() {
    console.log('รหัสไปรษณีย์', this.value);
});

function deleteAddress(addressID, fullAddress2) {
    Swal.fire({
        title: 'คุณแน่ใจเหรอ?',
        text: "ต้องการลบรายการนี้ : \"" + fullAddress2 + "\"",
        type: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#3085d6',
        cancelButtonColor: '#d33',
        confirmButtonText: 'ใช่, ลบที่อยู่!',
        cancelButtonText: 'ยกเลิก'
    }).then(function(result) {
        if (result.value) {
            $(document).ready(function() {
                $.ajax({
                    url: basePath+"pcs-admin/include/pages/address/deleteAddress.php?v=" + new Date().getMilliseconds(),
                    method: "POST",
                    data: { addressID: addressID, userID:userID },
                    success: function(data) {
                        if (data == 1) {
                            Swal.fire({ title: "ผิดพลาด!", text: "คุณไม่สามารถลบที่อยู่หลักได้", type: "error", showConfirmButton: true });
                        } else if (data == 2) {
                            Swal.fire({ title: "ลบสำเร็จ!", text: "คุณลบรายการดังกล่าวแล้ว", type: "success", showConfirmButton: false, timer: 3000 });
                            window.setTimeout(function() {
                                location.reload();
                            }, 3000);
                        } else {
                            Swal.fire({ title: "ผิดพลาด!", text: "กรุณาลองใหม่ภายหลัง", type: "error", showConfirmButton: true });
                        }
                    }
                });
            });
        }
    });
}

function setMainAddress(addressID, fullAddress2) {
    Swal.fire({
        title: 'คุณแน่ใจเหรอ?',
        html: "ต้องการตั้ง : \"" + fullAddress2 + "\" <br/><span class='text-danger'>เป็นที่อยู่หลัก</span>",
        type: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#3085d6',
        cancelButtonColor: '#d33',
        confirmButtonText: 'ใช่, ตั้งเป็นที่อยู่หลัก!',
        cancelButtonText: 'ยกเลิก'
    }).then(function(result) {
        if (result.value) {
            $(document).ready(function() {
                $.ajax({
                    url: basePath+"pcs-admin/include/pages/address/setMainAddress.php?v=" + new Date().getMilliseconds(),
                    method: "POST",
                    data: { addressID: addressID, userID:userID },
                    success: function(data) {
                        if (data == 1) {
                            Swal.fire({ title: "สำเร็จ!", text: "คุณเปลี่ยนที่อยู่หลักแล้ว", type: "success", showConfirmButton: false, timer: 3000 });
                            window.setTimeout(function() {
                                location.reload();
                            }, 3000);
                        } else {
                            Swal.fire({ title: "ผิดพลาด!", text: "กรุณาลองใหม่ภายหลัง", type: "error", showConfirmButton: true });
                        }
                    }
                });
            });
        }
    });
}

function editAddress(addressID) {
    $(document).ready(function() {
        $.ajax({
            url: basePath+"pcs-admin/include/pages/address/editAddress.php?v=" + new Date().getMilliseconds(),
            method: "POST",
            data: { addressID: addressID },
            success: function(data) {
                $('#edit-Address').html(data);
            }
        });
    });
}