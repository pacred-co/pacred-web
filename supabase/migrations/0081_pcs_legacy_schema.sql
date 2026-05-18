-- ════════════════════════════════════════════════════════════
-- 0081 · PCS Cargo legacy schema — 117 tables (D1 Phase A)
-- ════════════════════════════════════════════════════════════
-- Source: legacy MySQL `pcsc_main` — phpMyAdmin dump 2026-05-18-1358
--         (117 tables · 3,780,238 rows · ~8,898 customers).
-- D1 / ADR-0017: Pacred becomes the legacy PCS Cargo system, faithfully,
--   rebranded PCS → PR. Runbook: docs/runbook/pcs-data-migration.md.
--
-- THIS FILE = schema only — CREATE TABLE + PRIMARY KEY + sequences + the
--   legacy column COMMENTs. It carries NO customer data.
--   · indexes + sequence resync → 0082_pcs_legacy_indexes.sql
--   · PR member-code generator  → 0083_pcs_legacy_member_seq.sql
--   · the 3.78M data rows load SEPARATELY via psql (customer PII — never
--     committed to git; see runbook §5-§6).
--
-- Faithful-port notes (MySQL → PostgreSQL via pgloader):
--   · legacy table names kept verbatim — tb_* / tas_* / reserve_meeting_room.
--   · identifiers folded to lowercase (PostgreSQL-idiomatic: `userID` →
--     `userid`) — unquoted PG queries resolve to these. Phase-B code uses
--     lowercase column names.
--   · legacy types preserved — tinyint→smallint, datetime→timestamp,
--     decimal→numeric, year→smallint.
--   · datetime/date columns are NULLable — the legacy schema's NOT NULL
--     temporal columns hold 0000-00-00 sentinels, which have no PostgreSQL
--     representation and convert to NULL on load.
--   · the PCS→PR rebrand is applied to the DATA (userid / useridmain
--     columns) in the load step — this file is pure schema.
--   · legacy schema has 0 foreign keys / 0 triggers — none to port.
--
-- SECURITY — RLS is ENABLED on all 117 tables, with NO policies (below).
--   Supabase exposes every public-schema table to the `anon` role through
--   PostgREST. These tables hold customer PII — names, phones, emails,
--   addresses — and password hashes (tb_users.userpass). RLS-enabled +
--   no-policy locks every table to service_role only: the secure default.
--   Phase-B (ภูม) adds the per-table customer/staff access policies.
-- ════════════════════════════════════════════════════════════

-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--



--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--





--
-- Name: reserve_meeting_room; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reserve_meeting_room (
    id bigint NOT NULL,
    event character varying(255) NOT NULL,
    datemeet date,
    start_date time without time zone NOT NULL,
    end_date time without time zone NOT NULL,
    adminidcreate character varying(30) NOT NULL,
    note text NOT NULL
);


--
-- Name: reserve_meeting_room_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.reserve_meeting_room_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: reserve_meeting_room_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.reserve_meeting_room_id_seq OWNED BY public.reserve_meeting_room.id;


--
-- Name: tas_historydata_mobile; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tas_historydata_mobile (
    id bigint NOT NULL,
    date date,
    "time" time without time zone NOT NULL,
    adminid character varying(30) NOT NULL,
    adminidcreate character varying(30) NOT NULL,
    datetimeupload timestamp without time zone,
    name character varying(200) NOT NULL,
    scanid character varying(20) NOT NULL,
    status character varying(4) NOT NULL,
    note text NOT NULL,
    latitude numeric(10,8) NOT NULL,
    longitude numeric(20,8) NOT NULL,
    noteuser text NOT NULL
);


--
-- Name: tas_historydata_mobile_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tas_historydata_mobile_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tas_historydata_mobile_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tas_historydata_mobile_id_seq OWNED BY public.tas_historydata_mobile.id;


--
-- Name: tas_historydataold; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tas_historydataold (
    id bigint NOT NULL,
    date date,
    "time" time without time zone NOT NULL,
    adminid character varying(30) NOT NULL,
    adminidcreate character varying(30) NOT NULL,
    datetimeupload timestamp without time zone,
    name character varying(200) NOT NULL,
    scanid character varying(20) NOT NULL,
    status character varying(4) NOT NULL,
    note text NOT NULL
);


--
-- Name: tas_historydataold_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tas_historydataold_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tas_historydataold_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tas_historydataold_id_seq OWNED BY public.tas_historydataold.id;


--
-- Name: tas_historydataold_tmp; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tas_historydataold_tmp (
    id bigint NOT NULL,
    date date,
    "time" time without time zone NOT NULL,
    adminid character varying(30) NOT NULL,
    adminidcreate character varying(30) NOT NULL,
    datetimeupload timestamp without time zone,
    name character varying(200) NOT NULL,
    scanid character varying(20) NOT NULL,
    status character varying(4) NOT NULL,
    note text NOT NULL,
    filename character varying(250) NOT NULL
);


--
-- Name: tas_historydataold_tmp_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tas_historydataold_tmp_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tas_historydataold_tmp_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tas_historydataold_tmp_id_seq OWNED BY public.tas_historydataold_tmp.id;


--
-- Name: tas_holiday; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tas_holiday (
    id bigint NOT NULL,
    holidayname character varying(255) NOT NULL,
    holidaydate date,
    adminidcreate character varying(30) NOT NULL,
    date timestamp without time zone,
    note text NOT NULL
);


--
-- Name: tas_holiday_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tas_holiday_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tas_holiday_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tas_holiday_id_seq OWNED BY public.tas_holiday.id;


--
-- Name: tas_holiday_maid; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tas_holiday_maid (
    id bigint NOT NULL,
    holidaydate date,
    adminidcreate character varying(30) NOT NULL,
    date timestamp without time zone,
    note text NOT NULL,
    adminid character varying(30) NOT NULL
);


--
-- Name: tas_holiday_maid_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tas_holiday_maid_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tas_holiday_maid_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tas_holiday_maid_id_seq OWNED BY public.tas_holiday_maid.id;


--
-- Name: tas_leave; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tas_leave (
    id bigint NOT NULL,
    type character varying(1) NOT NULL,
    startdate date,
    enddate date,
    duration character varying(1) NOT NULL,
    reason text NOT NULL,
    filename character varying(250) NOT NULL,
    adminid character varying(30) NOT NULL,
    date timestamp without time zone,
    status character varying(1) NOT NULL,
    adminidcreate character varying(30) NOT NULL,
    adminidceo character varying(30) NOT NULL,
    adminidhr character varying(30) NOT NULL
);


--
-- Name: TABLE tas_leave; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.tas_leave IS 'การลางาน';


--
-- Name: COLUMN tas_leave.type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tas_leave.type IS 'ประเภทการลา 1=ลาป่วย,2=ลาพักผ่อน,3=ลากิจส่วนตัว,4=ลาคลอด';


--
-- Name: COLUMN tas_leave.duration; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tas_leave.duration IS '1=ทั้งวัน,2=ครึ่งวันเช้า,3=ครึ่งวันบ่าย';


--
-- Name: COLUMN tas_leave.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tas_leave.status IS '1=รอ HR ตรวจสอบ, 2=รอผู้บริหารอนุมัติ, 3=อนุมัติ,4=ไม่อนุมัติ';


--
-- Name: tas_leave_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tas_leave_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tas_leave_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tas_leave_id_seq OWNED BY public.tas_leave.id;


--
-- Name: tb_account_pcs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_account_pcs (
    id bigint NOT NULL,
    bankname character varying(300) NOT NULL,
    accountnumber character varying(300) NOT NULL,
    accountname character varying(300) NOT NULL,
    adminid character varying(30) NOT NULL
);


--
-- Name: tb_account_pcs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_account_pcs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_account_pcs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_account_pcs_id_seq OWNED BY public.tb_account_pcs.id;


--
-- Name: tb_address; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_address (
    addressid bigint NOT NULL,
    addressstatus character varying(1) DEFAULT '1'::character varying NOT NULL,
    addressname character varying(200) NOT NULL,
    addresslastname character varying(200) NOT NULL,
    addresstel character varying(10) NOT NULL,
    addresstel2 character varying(10),
    addressno character varying(200) NOT NULL,
    addresssubdistrict character varying(255) NOT NULL,
    addressdistrict character varying(255) NOT NULL,
    addressprovince character varying(255) NOT NULL,
    addresszipcode character varying(5) NOT NULL,
    addressnote text NOT NULL,
    userid character varying(10) NOT NULL,
    adminid character varying(30) NOT NULL,
    latitude numeric(10,8) NOT NULL,
    longitude numeric(10,8) NOT NULL
);


--
-- Name: COLUMN tb_address.addressstatus; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_address.addressstatus IS 'สถานะการลบที่อยู่ 1=ใช้งาน,0=ลบ';


--
-- Name: COLUMN tb_address.addressname; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_address.addressname IS 'ชื่อ';


--
-- Name: COLUMN tb_address.addresslastname; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_address.addresslastname IS 'นามสกุล';


--
-- Name: COLUMN tb_address.addresstel; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_address.addresstel IS 'เบอร์โทร';


--
-- Name: COLUMN tb_address.addresstel2; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_address.addresstel2 IS 'เบอร์โทร2';


--
-- Name: COLUMN tb_address.addressno; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_address.addressno IS 'บ้านเลขที่';


--
-- Name: COLUMN tb_address.addresssubdistrict; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_address.addresssubdistrict IS 'ตำบล';


--
-- Name: COLUMN tb_address.addressdistrict; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_address.addressdistrict IS 'อำเภอ';


--
-- Name: COLUMN tb_address.addressprovince; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_address.addressprovince IS 'จังหวัด';


--
-- Name: COLUMN tb_address.addresszipcode; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_address.addresszipcode IS 'รหัสไปรษณีย์';


--
-- Name: COLUMN tb_address.addressnote; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_address.addressnote IS 'หมายเหตุเพิ่มเติม';


--
-- Name: COLUMN tb_address.userid; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_address.userid IS 'รหัสสมาชิก';


--
-- Name: COLUMN tb_address.adminid; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_address.adminid IS 'admin ที่สร้างรายการ';


--
-- Name: tb_address_addressid_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_address_addressid_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_address_addressid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_address_addressid_seq OWNED BY public.tb_address.addressid;


--
-- Name: tb_address_main; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_address_main (
    id bigint NOT NULL,
    addressid bigint NOT NULL,
    userid character varying(10) NOT NULL
);


--
-- Name: tb_address_main_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_address_main_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_address_main_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_address_main_id_seq OWNED BY public.tb_address_main.id;


--
-- Name: tb_address_maomao_free; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_address_maomao_free (
    id bigint NOT NULL,
    datetime timestamp without time zone,
    addresssubdistrict character varying(255) NOT NULL,
    addressdistrict character varying(255) NOT NULL,
    addressprovince character varying(255) NOT NULL,
    addresszipcode character varying(5) NOT NULL,
    userid character varying(10) NOT NULL,
    adminid character varying(30) NOT NULL
);


--
-- Name: COLUMN tb_address_maomao_free.addresssubdistrict; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_address_maomao_free.addresssubdistrict IS 'ตำบล';


--
-- Name: COLUMN tb_address_maomao_free.addressdistrict; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_address_maomao_free.addressdistrict IS 'อำเภอ';


--
-- Name: COLUMN tb_address_maomao_free.addressprovince; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_address_maomao_free.addressprovince IS 'จังหวัด';


--
-- Name: COLUMN tb_address_maomao_free.addresszipcode; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_address_maomao_free.addresszipcode IS 'รหัสไปรษณีย์';


--
-- Name: COLUMN tb_address_maomao_free.userid; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_address_maomao_free.userid IS 'รหัสสมาชิก';


--
-- Name: COLUMN tb_address_maomao_free.adminid; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_address_maomao_free.adminid IS 'admin ที่สร้างรายการ';


--
-- Name: tb_address_maomao_free_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_address_maomao_free_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_address_maomao_free_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_address_maomao_free_id_seq OWNED BY public.tb_address_maomao_free.id;


--
-- Name: tb_admin; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_admin (
    id integer NOT NULL,
    adminid character varying(20) NOT NULL,
    adminstatusa character varying(1) DEFAULT '1'::character varying NOT NULL,
    adminpass character varying(80) NOT NULL,
    adminname character varying(255) NOT NULL,
    adminlastname character varying(255) NOT NULL,
    adminemail character varying(255) NOT NULL,
    adminemailorg bigint NOT NULL,
    adminsex character varying(4),
    adminbirthday timestamp without time zone,
    adminstatus character varying(2) NOT NULL,
    adminstatussale character varying(1) NOT NULL,
    adminpicture character varying(150) DEFAULT 'user.jpg'::character varying NOT NULL,
    adminregistered timestamp without time zone,
    admintel character varying(13) NOT NULL,
    adminlastlogin timestamp without time zone,
    pcs_admin_logged character varying(80),
    admintype character varying(1) NOT NULL,
    department character varying(2) NOT NULL,
    section character varying(2) NOT NULL,
    companytype character varying(1) NOT NULL,
    startdate timestamp without time zone,
    enddate timestamp without time zone,
    enddateoflogin timestamp without time zone,
    admindel character varying(40) NOT NULL,
    datedel timestamp without time zone,
    adminnickname character varying(30) NOT NULL,
    admintmp character varying(1) NOT NULL,
    admintelorg bigint NOT NULL,
    salarytype character varying(1) NOT NULL,
    adminidcreate character varying(30) NOT NULL,
    nationalidcard character varying(25) NOT NULL,
    expirydate date,
    salary numeric(10,2) NOT NULL,
    datecreate timestamp without time zone,
    statusresetpass character varying(1) NOT NULL,
    nationalidcardfile character varying(255) NOT NULL,
    copyhouseregistrationfile character varying(255) NOT NULL,
    resumefile character varying(255) NOT NULL,
    religion character varying(2) NOT NULL,
    nationality character varying(200) NOT NULL,
    maritalstatus character varying(2) NOT NULL,
    adminlinetokennotify character varying(100) NOT NULL,
    dateadminlinetokennotify timestamp without time zone,
    bearer_token character varying(255) NOT NULL
);


--
-- Name: COLUMN tb_admin.adminstatusa; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_admin.adminstatusa IS 'สถานะการใช้งานบัญชี 1=ใช้งาน,0=ไม่ใช้งาน';


--
-- Name: COLUMN tb_admin.adminemailorg; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_admin.adminemailorg IS 'เมลองค์กร';


--
-- Name: COLUMN tb_admin.adminstatus; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_admin.adminstatus IS 'สิทธิ์การเข้าถึงข้อมูล';


--
-- Name: COLUMN tb_admin.admintype; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_admin.admintype IS '1=พนักงานประจำ, 2=ทดลองงาน, 3=เด็กฝึกงาน, 4=สหกิจศึกษา, 5=พาสเนอร์, 6=คนในบ้าน';


--
-- Name: COLUMN tb_admin.admintmp; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_admin.admintmp IS '2=พักชัวคราว';


--
-- Name: COLUMN tb_admin.religion; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_admin.religion IS '1 = พุทธศาสนา,2 = คริสต์ศาสนา,3 = อิสลาม,4 = ฮินดู,5 = ซิกข์,6 = ยูดาห์,7 = ไม่มีศาสนา,8 = ศาสนาอื่นๆ	';


--
-- Name: COLUMN tb_admin.maritalstatus; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_admin.maritalstatus IS '1 = โสด,2 = แต่งงานแล้ว,3 = หย่าร้าง,4 = ม่าย,5 = แยกกันอยู่,6 = มีความสัมพันธ์,7 = หมั้น,8 = อื่น ๆ';


--
-- Name: tb_admin_address; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_admin_address (
    id bigint NOT NULL,
    addressno text NOT NULL,
    district character varying(255) NOT NULL,
    amphoe character varying(255) NOT NULL,
    province character varying(255) NOT NULL,
    zipcode character varying(10) NOT NULL,
    addressnote text NOT NULL,
    date timestamp without time zone,
    adminid character varying(30) NOT NULL
);


--
-- Name: tb_admin_address_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_admin_address_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_admin_address_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_admin_address_id_seq OWNED BY public.tb_admin_address.id;


--
-- Name: tb_admin_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_admin_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_admin_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_admin_id_seq OWNED BY public.tb_admin.id;


--
-- Name: tb_api_china_hs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_api_china_hs (
    id bigint NOT NULL,
    whsid bigint NOT NULL,
    url text NOT NULL,
    type integer NOT NULL,
    status integer NOT NULL,
    namecategory character varying(200) NOT NULL
);


--
-- Name: COLUMN tb_api_china_hs.type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_api_china_hs.type IS '1=ค้นหาคำ,2=วางลิงก์1688,3=วางลิงก์taobao,4=วางลิงก์tmall';


--
-- Name: COLUMN tb_api_china_hs.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_api_china_hs.status IS '0=ทำงานปกติ,1=ไม่ทำงาน';


--
-- Name: tb_api_china_hs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_api_china_hs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_api_china_hs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_api_china_hs_id_seq OWNED BY public.tb_api_china_hs.id;


--
-- Name: tb_bill; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_bill (
    billid bigint NOT NULL,
    date timestamp without time zone,
    printstatus character varying(1) NOT NULL,
    adminid character varying(30) NOT NULL
);


--
-- Name: tb_bill_billid_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_bill_billid_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_bill_billid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_bill_billid_seq OWNED BY public.tb_bill.billid;


--
-- Name: tb_bill_item; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_bill_item (
    id bigint NOT NULL,
    billid bigint NOT NULL,
    fid bigint NOT NULL
);


--
-- Name: tb_bill_item_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_bill_item_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_bill_item_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_bill_item_id_seq OWNED BY public.tb_bill_item.id;


--
-- Name: tb_cart; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_cart (
    id integer NOT NULL,
    cdetails text NOT NULL,
    curl character varying(300) NOT NULL,
    ctitle character varying(300) NOT NULL,
    cnameshop character varying(300) DEFAULT 'pcs'::character varying NOT NULL,
    cprovider character varying(1) DEFAULT '4'::character varying NOT NULL,
    cimages character varying(300) NOT NULL,
    cprice numeric(10,2) NOT NULL,
    camount integer NOT NULL,
    ccolor character varying(200) NOT NULL,
    csize character varying(200) NOT NULL,
    userid character varying(30) NOT NULL
);


--
-- Name: COLUMN tb_cart.cnameshop; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_cart.cnameshop IS 'pcs=ไม่มีชื่อร้าน';


--
-- Name: tb_cart_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_cart_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_cart_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_cart_id_seq OWNED BY public.tb_cart.id;


--
-- Name: tb_cash_back; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_cash_back (
    userid character varying(10) NOT NULL,
    cbtotal numeric(10,2) NOT NULL
);


--
-- Name: tb_cash_back_hs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_cash_back_hs (
    cbhid bigint NOT NULL,
    cbhdate timestamp without time zone,
    cbhstatus character varying(1) NOT NULL,
    cbhamount numeric(10,2) NOT NULL,
    userid character varying(10) NOT NULL,
    cbhrefid text NOT NULL
);


--
-- Name: COLUMN tb_cash_back_hs.cbhstatus; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_cash_back_hs.cbhstatus IS '1=บวกเพิ่ม,2=ชำระเงิน';


--
-- Name: tb_cash_back_hs_cbhid_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_cash_back_hs_cbhid_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_cash_back_hs_cbhid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_cash_back_hs_cbhid_seq OWNED BY public.tb_cash_back_hs.cbhid;


--
-- Name: tb_check_forwarder; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_check_forwarder (
    id bigint NOT NULL,
    cfstatus character varying(1) NOT NULL,
    fid bigint NOT NULL,
    date timestamp without time zone,
    adminid character varying(50) NOT NULL
);


--
-- Name: tb_check_forwarder_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_check_forwarder_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_check_forwarder_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_check_forwarder_id_seq OWNED BY public.tb_check_forwarder.id;


--
-- Name: tb_cnt; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_cnt (
    id bigint NOT NULL,
    cntname character varying(1000) NOT NULL,
    cntstatus character varying(1) NOT NULL,
    cntamount numeric(10,2) NOT NULL,
    cntimagesslip character varying(200) NOT NULL,
    date timestamp without time zone,
    adminidcreate character varying(30) NOT NULL,
    nameblank character varying(300) NOT NULL,
    noblank character varying(200) NOT NULL,
    nameaccount character varying(300) NOT NULL,
    cntfile character varying(200) NOT NULL,
    dateupdate timestamp without time zone,
    adminidupdate character varying(30) NOT NULL
);


--
-- Name: TABLE tb_cnt; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.tb_cnt IS 'ตารางจ่ายเงินค่าตู้';


--
-- Name: COLUMN tb_cnt.cntname; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_cnt.cntname IS 'เลขตู้';


--
-- Name: COLUMN tb_cnt.cntamount; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_cnt.cntamount IS 'จำนวนเงินที่จ่าย';


--
-- Name: COLUMN tb_cnt.date; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_cnt.date IS 'วันที่ทำรายการ';


--
-- Name: COLUMN tb_cnt.adminidcreate; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_cnt.adminidcreate IS 'แอดมินทำรายการ';


--
-- Name: tb_cnt_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_cnt_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_cnt_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_cnt_id_seq OWNED BY public.tb_cnt.id;


--
-- Name: tb_cnt_item; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_cnt_item (
    id bigint NOT NULL,
    fcabinetnumber character varying(300) NOT NULL,
    cntid bigint NOT NULL
);


--
-- Name: tb_cnt_item_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_cnt_item_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_cnt_item_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_cnt_item_id_seq OWNED BY public.tb_cnt_item.id;


--
-- Name: tb_cnt_pay_idorco; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_cnt_pay_idorco (
    id bigint NOT NULL,
    fidorco character varying(30) NOT NULL,
    fcabinetnumber character varying(300) NOT NULL
);


--
-- Name: TABLE tb_cnt_pay_idorco; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.tb_cnt_pay_idorco IS 'รายการจ่ายเงินเลข PK';


--
-- Name: tb_cnt_pay_idorco_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_cnt_pay_idorco_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_cnt_pay_idorco_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_cnt_pay_idorco_id_seq OWNED BY public.tb_cnt_pay_idorco.id;


--
-- Name: tb_cnt_pay_trackingchn; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_cnt_pay_trackingchn (
    id bigint NOT NULL,
    ftrackingchn character varying(50) NOT NULL,
    fcabinetnumber character varying(300) NOT NULL
);


--
-- Name: TABLE tb_cnt_pay_trackingchn; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.tb_cnt_pay_trackingchn IS 'ข้อมูลจ่ายตามเลขแทรคกิ้ง';


--
-- Name: tb_cnt_pay_trackingchn_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_cnt_pay_trackingchn_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_cnt_pay_trackingchn_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_cnt_pay_trackingchn_id_seq OWNED BY public.tb_cnt_pay_trackingchn.id;


--
-- Name: tb_co; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_co (
    id integer NOT NULL,
    costatus character varying(1) DEFAULT '1'::character varying NOT NULL,
    coid character varying(10) NOT NULL,
    coname character varying(255) NOT NULL
);


--
-- Name: tb_co_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_co_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_co_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_co_id_seq OWNED BY public.tb_co.id;


--
-- Name: tb_contact_outsider; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_contact_outsider (
    id bigint NOT NULL,
    title text NOT NULL,
    coname character varying(255) NOT NULL,
    colastname character varying(255) NOT NULL,
    coemail character varying(255) NOT NULL,
    cotel character varying(13) NOT NULL,
    coaddress text NOT NULL,
    conickname character varying(255) NOT NULL,
    note text NOT NULL,
    date timestamp without time zone,
    dateupdate timestamp without time zone,
    adminidcreate character varying(30) NOT NULL,
    adminidupdate character varying(30) NOT NULL
);


--
-- Name: TABLE tb_contact_outsider; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.tb_contact_outsider IS 'รายชื่อติดต่อบุคคลภายนอก';


--
-- Name: tb_contact_outsider_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_contact_outsider_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_contact_outsider_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_contact_outsider_id_seq OWNED BY public.tb_contact_outsider.id;


--
-- Name: tb_corporate; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_corporate (
    id bigint NOT NULL,
    userid character varying(10) NOT NULL,
    corporatenumber character varying(13) NOT NULL,
    corporatename character varying(300) NOT NULL,
    corporateaddress text NOT NULL,
    corporatefile character varying(200) NOT NULL,
    corporatefile20 character varying(200) NOT NULL,
    cpdatecreate timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    corporatestatus character varying(1) NOT NULL
);


--
-- Name: tb_corporate_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_corporate_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_corporate_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_corporate_id_seq OWNED BY public.tb_corporate.id;


--
-- Name: tb_cost_container; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_cost_container (
    id bigint NOT NULL,
    fcabinetnumber character varying(300) NOT NULL,
    fproductstype1 numeric(10,2) NOT NULL,
    fproductstype2 numeric(10,2) NOT NULL,
    fproductstype3 numeric(10,2) NOT NULL,
    fproductstype4 numeric(10,2) NOT NULL,
    adminid character varying(50),
    date timestamp without time zone
);


--
-- Name: tb_cost_container_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_cost_container_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_cost_container_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_cost_container_id_seq OWNED BY public.tb_cost_container.id;


--
-- Name: tb_credit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_credit (
    userid character varying(10) NOT NULL,
    creditvalue numeric(10,2) NOT NULL
);


--
-- Name: tb_csvimport; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_csvimport (
    id character varying(15) NOT NULL,
    csvname character varying(100) NOT NULL,
    csvdate timestamp without time zone,
    csvcount integer NOT NULL,
    csvcountprocess integer NOT NULL,
    adminid character varying(10) NOT NULL
);


--
-- Name: COLUMN tb_csvimport.id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_csvimport.id IS 'ปีเดือนวัน-เวลา';


--
-- Name: tb_customrate_hs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_customrate_hs (
    id bigint NOT NULL,
    adminid character varying(50) NOT NULL,
    date timestamp without time zone,
    userid character varying(30) NOT NULL
);


--
-- Name: tb_customrate_hs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_customrate_hs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_customrate_hs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_customrate_hs_id_seq OWNED BY public.tb_customrate_hs.id;


--
-- Name: tb_education_background; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_education_background (
    id bigint NOT NULL,
    educationstatus character varying(1) NOT NULL,
    educationlevel character varying(1) NOT NULL,
    institution character varying(255) NOT NULL,
    faculty character varying(255) NOT NULL,
    educationdepartment character varying(255) NOT NULL,
    graduateyear smallint,
    gpa numeric(10,2) NOT NULL,
    adminid character varying(30) NOT NULL,
    date timestamp without time zone
);


--
-- Name: COLUMN tb_education_background.educationstatus; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_education_background.educationstatus IS '1=จบการศึกษา, 2=กำลังศึกษาอยู่';


--
-- Name: COLUMN tb_education_background.educationlevel; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_education_background.educationlevel IS '1=ต่ำกว่ามัธยมศึกษา,2=มัธยมศึกษาตอนต้น,3=มัธยมศึกษาตอนปลาย,4=ปวช.,5=ปวท.,6=ปวส.,7=อนุปริญญา,8=ปริญญาตรี,9=ปริญญาโท,10=ปริญญาเอก';


--
-- Name: tb_education_background_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_education_background_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_education_background_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_education_background_id_seq OWNED BY public.tb_education_background.id;


--
-- Name: tb_farwarder_quotation; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_farwarder_quotation (
    id bigint NOT NULL,
    fqno character varying(30) NOT NULL,
    date timestamp without time zone,
    adminidcreate character varying(30) NOT NULL,
    adminidapprover character varying(30) NOT NULL,
    dateapprover timestamp without time zone,
    compnumber character varying(13) NOT NULL,
    compname character varying(300) NOT NULL,
    compaddress text NOT NULL,
    contact character varying(500) NOT NULL,
    userid character varying(30) NOT NULL,
    email character varying(200) NOT NULL,
    tel character varying(15) NOT NULL
);


--
-- Name: COLUMN tb_farwarder_quotation.date; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_farwarder_quotation.date IS 'วันที่สร้างรายการ';


--
-- Name: COLUMN tb_farwarder_quotation.adminidcreate; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_farwarder_quotation.adminidcreate IS 'แอดมินที่สร้าง';


--
-- Name: COLUMN tb_farwarder_quotation.adminidapprover; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_farwarder_quotation.adminidapprover IS 'คนอนุมัติราคา';


--
-- Name: COLUMN tb_farwarder_quotation.dateapprover; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_farwarder_quotation.dateapprover IS 'เวลาที่อนุมัติ';


--
-- Name: COLUMN tb_farwarder_quotation.compnumber; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_farwarder_quotation.compnumber IS 'เลขผู้เสียภาษี';


--
-- Name: COLUMN tb_farwarder_quotation.compname; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_farwarder_quotation.compname IS 'ชื่อบริษัท';


--
-- Name: COLUMN tb_farwarder_quotation.compaddress; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_farwarder_quotation.compaddress IS 'ที่อยู่บริษัท';


--
-- Name: COLUMN tb_farwarder_quotation.contact; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_farwarder_quotation.contact IS 'ผู้ติดต่อมา';


--
-- Name: tb_farwarder_quotation_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_farwarder_quotation_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_farwarder_quotation_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_farwarder_quotation_id_seq OWNED BY public.tb_farwarder_quotation.id;


--
-- Name: tb_farwarder_quotation_item; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_farwarder_quotation_item (
    id bigint NOT NULL,
    fqid bigint NOT NULL,
    warehousetype character varying(1) NOT NULL,
    transporttype character varying(1) NOT NULL,
    producttype character varying(1) NOT NULL,
    price numeric(10,2) NOT NULL
);


--
-- Name: COLUMN tb_farwarder_quotation_item.warehousetype; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_farwarder_quotation_item.warehousetype IS '1=กวางโจว,2=อี้อู';


--
-- Name: COLUMN tb_farwarder_quotation_item.transporttype; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_farwarder_quotation_item.transporttype IS '1=ทางรถ,2=เรือ';


--
-- Name: COLUMN tb_farwarder_quotation_item.producttype; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_farwarder_quotation_item.producttype IS '1=ทั่วไป';


--
-- Name: tb_farwarder_quotation_item_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_farwarder_quotation_item_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_farwarder_quotation_item_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_farwarder_quotation_item_id_seq OWNED BY public.tb_farwarder_quotation_item.id;


--
-- Name: tb_forwarder; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_forwarder (
    id bigint NOT NULL,
    fdate timestamp without time zone,
    fstatus character varying(2) DEFAULT '1'::character varying NOT NULL,
    paydeposit character varying(1),
    fpallet character varying(100),
    fdatestatus2 timestamp without time zone,
    fdatestatus3 timestamp without time zone,
    fdatestatus4 timestamp without time zone,
    fdatestatus5 timestamp without time zone,
    fdatestatus6 timestamp without time zone,
    fdatestatus7 timestamp without time zone,
    fstatuscaron character varying(1),
    fstatuscardateon timestamp without time zone,
    fstatuscaradminon character varying(10) NOT NULL,
    fstatuscaroff character varying(1) NOT NULL,
    fstatuscardateoff timestamp without time zone,
    fstatuscaradminoff character varying(10) NOT NULL,
    printstatus1 character varying(1) DEFAULT '0'::character varying NOT NULL,
    printstatus2 character varying(1) DEFAULT '0'::character varying NOT NULL,
    printstatus3 character varying(1) DEFAULT '0'::character varying NOT NULL,
    printstatus4 character varying(1) NOT NULL,
    fdatekey timestamp without time zone,
    fdateadminstatus timestamp without time zone,
    fdatebarcode timestamp without time zone,
    fwarehousechina character varying(1) NOT NULL,
    fwarehousename character varying(1) NOT NULL,
    ftransporttype character varying(1) NOT NULL,
    fcabinetnumber character varying(300) NOT NULL,
    fidorco character varying(30),
    ftrackingchn character varying(50) NOT NULL,
    ftrackingchn2 character varying(100),
    fdatetothai date,
    fdatecontainerclose timestamp without time zone,
    fshipby character varying(10) NOT NULL,
    ffreeshipping character varying(1) NOT NULL,
    ftrackingth character varying(50) DEFAULT '-'::character varying NOT NULL,
    famount integer DEFAULT 1 NOT NULL,
    famountcount character varying(1),
    fdetail text NOT NULL,
    fnote text,
    fnoteuser character varying(1) NOT NULL,
    fnoteuserread character varying(1) NOT NULL,
    fnotedate timestamp without time zone,
    fcover character varying(500) NOT NULL,
    fimg1 character varying(40),
    fimg2 character varying(40),
    fimg3 character varying(40),
    fimg4 character varying(40),
    fphotoend character varying(200) NOT NULL,
    fproductstype character varying(1) NOT NULL,
    fproductstype2 character varying(1),
    fweight numeric(10,2) NOT NULL,
    fwidth numeric(10,2) NOT NULL,
    flength numeric(10,2) NOT NULL,
    fheight numeric(10,2) NOT NULL,
    fvolume numeric(10,5) NOT NULL,
    customratekg numeric(10,2) NOT NULL,
    customratecbm numeric(10,2) NOT NULL,
    customrate character varying(1) DEFAULT '0'::character varying NOT NULL,
    frefprice character varying(1) NOT NULL,
    frefrate numeric(10,2) NOT NULL,
    fcostrefrate numeric(10,2) NOT NULL,
    ftransportprice numeric(10,2) NOT NULL,
    ftransportpricesum character varying(1),
    fpriceupdate numeric(10,2) NOT NULL,
    fdiscount numeric(10,2) NOT NULL,
    fshippingservice numeric(10,2) DEFAULT 0.00,
    ftotalprice numeric(10,2) NOT NULL,
    fcosttotalprice numeric(10,2) NOT NULL,
    fcosttotalpricesheet numeric(10,2) NOT NULL,
    fprofittransportchn numeric(10,2) NOT NULL,
    fprofitpriceupdate numeric(10,2) NOT NULL,
    fprofittotal numeric(10,2) NOT NULL,
    faddressname character varying(200) NOT NULL,
    faddresslastname character varying(200) NOT NULL,
    faddressno character varying(255) NOT NULL,
    faddresssubdistrict character varying(255) NOT NULL,
    faddressdistrict character varying(255) NOT NULL,
    faddressprovince character varying(255) NOT NULL,
    faddresszipcode character varying(5) NOT NULL,
    faddressnote text NOT NULL,
    faddresstel character varying(10) NOT NULL,
    faddresstel2 character varying(10) NOT NULL,
    faddresslatitude numeric(10,8) NOT NULL,
    faddresslongitude numeric(10,8) NOT NULL,
    userid character varying(10) NOT NULL,
    adminid character varying(10) NOT NULL,
    adminidcreator character varying(10) NOT NULL,
    adminidkey character varying(10) NOT NULL,
    flockdate timestamp without time zone,
    adminidupdate character varying(10) NOT NULL,
    session character varying(100) NOT NULL,
    reforder character varying(30) NOT NULL,
    fcredit character varying(1) NOT NULL,
    fcreditdate timestamp without time zone,
    fusercompany character varying(1) NOT NULL,
    fsendsms1day character varying(1) NOT NULL,
    fsendsms3day character varying(1) NOT NULL,
    fsendsms3eday character varying(1) NOT NULL,
    paymethod character varying(1) DEFAULT '1'::character varying NOT NULL,
    crate character varying(1) DEFAULT '2'::character varying NOT NULL,
    pricecrate numeric(10,2) NOT NULL,
    fqc character varying(1) NOT NULL,
    fqcprice numeric(10,2) NOT NULL,
    ftransportpricechnthb numeric(10,2) NOT NULL,
    pricemore character varying(1) NOT NULL,
    priceother numeric(10,2) NOT NULL,
    linkapiorder character varying(1) NOT NULL,
    smpcs character varying(255),
    subuserid character varying(50) NOT NULL
);


--
-- Name: COLUMN tb_forwarder.fdate; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder.fdate IS 'วันที่สร้าง';


--
-- Name: COLUMN tb_forwarder.paydeposit; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder.paydeposit IS '1 คือ รอตรวจสอบการจ่ายเงิน';


--
-- Name: COLUMN tb_forwarder.fdatestatus4; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder.fdatestatus4 IS 'สินค้าเข้าโกดังไทย';


--
-- Name: COLUMN tb_forwarder.fstatuscaron; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder.fstatuscaron IS 'สถานะรายการขึ้นรถ: ';


--
-- Name: COLUMN tb_forwarder.printstatus1; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder.printstatus1 IS '0=ยังไม่พิมพ์,1=พิมพ์แล้ว	';


--
-- Name: COLUMN tb_forwarder.printstatus2; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder.printstatus2 IS '0=ยังไม่พิมพ์,1=พิมพ์แล้ว';


--
-- Name: COLUMN tb_forwarder.printstatus3; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder.printstatus3 IS '0=ยังไม่พิมพ์,1=พิมพ์แล้ว';


--
-- Name: COLUMN tb_forwarder.fdatekey; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder.fdatekey IS 'วันทีกรอกข้อมูลสินค้า';


--
-- Name: COLUMN tb_forwarder.fwarehousechina; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder.fwarehousechina IS '1=กวางโจว,2=อี้อู';


--
-- Name: COLUMN tb_forwarder.fwarehousename; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder.fwarehousename IS 'โกดังรับของที่จีน
1=แสง, 2=CTT, 3=MK, 4=MX, 5=JMF, 6=GOGO, 7=CargoCenter, 8=MOMO';


--
-- Name: COLUMN tb_forwarder.ftransporttype; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder.ftransporttype IS 'รูปแบบการขนส่ง';


--
-- Name: COLUMN tb_forwarder.fdatecontainerclose; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder.fdatecontainerclose IS 'วันที่ปิดตู้';


--
-- Name: COLUMN tb_forwarder.fshipby; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder.fshipby IS 'รูปแบบการขนส่งไทย';


--
-- Name: COLUMN tb_forwarder.ffreeshipping; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder.ffreeshipping IS '1=สั่งตอนโปรส่งฟรี พื้นที่ กทม';


--
-- Name: COLUMN tb_forwarder.famount; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder.famount IS 'จำนวนกล่อง';


--
-- Name: COLUMN tb_forwarder.famountcount; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder.famountcount IS 'รวมกล่อง';


--
-- Name: COLUMN tb_forwarder.customrate; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder.customrate IS '0=คิดตามปกติ,1=กำหนดเอง';


--
-- Name: COLUMN tb_forwarder.ftransportprice; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder.ftransportprice IS 'ค่าขนส่งในไทย';


--
-- Name: COLUMN tb_forwarder.ftransportpricesum; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder.ftransportpricesum IS '1=คิดรวมรายการอื่น';


--
-- Name: COLUMN tb_forwarder.fdiscount; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder.fdiscount IS 'ส่วนลด';


--
-- Name: COLUMN tb_forwarder.fshippingservice; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder.fshippingservice IS 'ค่าบริการฝากนำเข้า';


--
-- Name: COLUMN tb_forwarder.fcosttotalprice; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder.fcosttotalprice IS 'ต้นทุนขนส่ง';


--
-- Name: COLUMN tb_forwarder.fcosttotalpricesheet; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder.fcosttotalpricesheet IS 'ต้นทุนจากSheet';


--
-- Name: COLUMN tb_forwarder.fprofittransportchn; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder.fprofittransportchn IS 'กำไรค่าขนส่งจีน';


--
-- Name: COLUMN tb_forwarder.fprofitpriceupdate; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder.fprofitpriceupdate IS 'กำไร เพิ่ม/ลด เงิน';


--
-- Name: COLUMN tb_forwarder.fprofittotal; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder.fprofittotal IS 'กำไรสุทธิ';


--
-- Name: COLUMN tb_forwarder.adminidkey; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder.adminidkey IS 'คนkey กล่อง';


--
-- Name: COLUMN tb_forwarder.fusercompany; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder.fusercompany IS 'นค บริษัท';


--
-- Name: COLUMN tb_forwarder.paymethod; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder.paymethod IS 'วิธีเก็บเงิน 1=ต้นทาง 2=ปลายทาง';


--
-- Name: COLUMN tb_forwarder.crate; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder.crate IS '1=ตีลัง';


--
-- Name: COLUMN tb_forwarder.fqc; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder.fqc IS '1=ไม่ตรวจนับ, 2=ตรวจนับ';


--
-- Name: COLUMN tb_forwarder.fqcprice; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder.fqcprice IS 'ค่า QC สินค้า';


--
-- Name: COLUMN tb_forwarder.ftransportpricechnthb; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder.ftransportpricechnthb IS 'ค่าขนส่งจีน บาท';


--
-- Name: COLUMN tb_forwarder.pricemore; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder.pricemore IS '1=ค่าตีลังไม้,2=ค่าขนส่งจีน';


--
-- Name: COLUMN tb_forwarder.priceother; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder.priceother IS 'ค่าอื่นๆ qp';


--
-- Name: COLUMN tb_forwarder.linkapiorder; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder.linkapiorder IS 'การเชื่อมต่อผ่าน API 1 = JMF';


--
-- Name: COLUMN tb_forwarder.smpcs; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder.smpcs IS 'สำรองเชื่อม sm';


--
-- Name: tb_forwarder_driver; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_forwarder_driver (
    id bigint NOT NULL,
    fddate timestamp without time zone,
    fdname character varying(200) NOT NULL,
    fdamount integer NOT NULL,
    fdadminid character varying(20) NOT NULL,
    fdadmincreator character varying(20) NOT NULL,
    fdstatus character varying(1) NOT NULL,
    endtime timestamp without time zone
);


--
-- Name: tb_forwarder_driver_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_forwarder_driver_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_forwarder_driver_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_forwarder_driver_id_seq OWNED BY public.tb_forwarder_driver.id;


--
-- Name: tb_forwarder_driver_item; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_forwarder_driver_item (
    id bigint NOT NULL,
    fdid bigint NOT NULL,
    fid bigint NOT NULL,
    fdistatus character varying(1) NOT NULL,
    fdipictureon character varying(150) NOT NULL,
    fdipictureoff character varying(150) NOT NULL
);


--
-- Name: COLUMN tb_forwarder_driver_item.fdipictureon; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder_driver_item.fdipictureon IS 'รูปขึ้นรถ';


--
-- Name: COLUMN tb_forwarder_driver_item.fdipictureoff; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder_driver_item.fdipictureoff IS 'ลงรถ';


--
-- Name: tb_forwarder_driver_item_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_forwarder_driver_item_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_forwarder_driver_item_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_forwarder_driver_item_id_seq OWNED BY public.tb_forwarder_driver_item.id;


--
-- Name: tb_forwarder_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_forwarder_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_forwarder_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_forwarder_id_seq OWNED BY public.tb_forwarder.id;


--
-- Name: tb_forwarder_img; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_forwarder_img (
    id bigint NOT NULL,
    img character varying(255) NOT NULL,
    fid bigint NOT NULL
);


--
-- Name: tb_forwarder_img_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_forwarder_img_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_forwarder_img_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_forwarder_img_id_seq OWNED BY public.tb_forwarder_img.id;


--
-- Name: tb_forwarder_import; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_forwarder_import (
    id bigint NOT NULL,
    fid bigint NOT NULL,
    fiamount integer NOT NULL,
    fidate timestamp without time zone,
    adminid character varying(10) NOT NULL
);


--
-- Name: tb_forwarder_import2; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_forwarder_import2 (
    id bigint NOT NULL,
    fid bigint,
    keysearch character varying(80) NOT NULL,
    fipallet character varying(5) NOT NULL,
    fi2amount integer NOT NULL,
    fi2date timestamp without time zone,
    adminid character varying(10) NOT NULL
);


--
-- Name: tb_forwarder_import2_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_forwarder_import2_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_forwarder_import2_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_forwarder_import2_id_seq OWNED BY public.tb_forwarder_import2.id;


--
-- Name: tb_forwarder_import_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_forwarder_import_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_forwarder_import_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_forwarder_import_id_seq OWNED BY public.tb_forwarder_import.id;


--
-- Name: tb_forwarder_item; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_forwarder_item (
    id bigint NOT NULL,
    productid bigint NOT NULL,
    productname character varying(255) NOT NULL,
    producttracking character varying(255) NOT NULL,
    producttrackingnote text NOT NULL,
    productqty integer NOT NULL,
    productbagid bigint NOT NULL,
    productwidth numeric(10,2) NOT NULL,
    productlength numeric(10,2) NOT NULL,
    productheight numeric(10,2) NOT NULL,
    productweightperitem numeric(10,2) NOT NULL,
    productweightall numeric(10,2) NOT NULL,
    productcbmperitem numeric(10,2) NOT NULL,
    productcbmall numeric(10,2) NOT NULL,
    productweightformat character varying(100) NOT NULL,
    producttypecode character varying(5) NOT NULL,
    containercode character varying(200) NOT NULL,
    userid character varying(50) NOT NULL,
    fid bigint NOT NULL,
    date timestamp without time zone,
    lasttimeupdated timestamp without time zone,
    adminid character varying(50) NOT NULL,
    adminidupdated character varying(50) NOT NULL,
    domesticshippingchina numeric(10,2) NOT NULL,
    chinawoodencratefeetype character varying(1) NOT NULL,
    chinawoodencratefee numeric(10,2) NOT NULL,
    locationwth character varying(20) NOT NULL,
    otherservicefee numeric(10,2) NOT NULL,
    thailanddeliveryfee numeric(10,2) NOT NULL,
    frefprice character varying(1) NOT NULL,
    fqc character varying(1) NOT NULL,
    fqcprice numeric(10,2) NOT NULL,
    fpriceupdate numeric(10,2) NOT NULL,
    fdiscount numeric(10,2) NOT NULL
);


--
-- Name: COLUMN tb_forwarder_item.adminid; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder_item.adminid IS 'แอดมินที่สร้าง';


--
-- Name: COLUMN tb_forwarder_item.adminidupdated; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder_item.adminidupdated IS 'แอดมินที่แก้ไขล่าสุด';


--
-- Name: COLUMN tb_forwarder_item.domesticshippingchina; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder_item.domesticshippingchina IS 'ค่าขนส่งในจีน เดิมใน tb_forwarder fTransportPriceCHNTHB';


--
-- Name: COLUMN tb_forwarder_item.chinawoodencratefeetype; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder_item.chinawoodencratefeetype IS 'ตีลังไม้ 1=ไม่ตี, 2=ตีลัง เดิม tb_forwarder crate';


--
-- Name: COLUMN tb_forwarder_item.chinawoodencratefee; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder_item.chinawoodencratefee IS 'ค่าตีลังไม้';


--
-- Name: COLUMN tb_forwarder_item.otherservicefee; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder_item.otherservicefee IS 'ค่าบริการอื่น ๆ';


--
-- Name: COLUMN tb_forwarder_item.thailanddeliveryfee; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder_item.thailanddeliveryfee IS 'ค่าขนส่งในไทย';


--
-- Name: COLUMN tb_forwarder_item.frefprice; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder_item.frefprice IS 'คิดเรทนำเข้าตาม 1=น้ำหนัก 2=ปริมาตร';


--
-- Name: COLUMN tb_forwarder_item.fqc; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder_item.fqc IS '	1=ไม่ตรวจนับ, 2=ตรวจนับ';


--
-- Name: COLUMN tb_forwarder_item.fqcprice; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder_item.fqcprice IS 'ค่า QC สินค้า';


--
-- Name: COLUMN tb_forwarder_item.fpriceupdate; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder_item.fpriceupdate IS 'ราคาที่เก็บเพิ่มมาจากฝากนำเข้า';


--
-- Name: COLUMN tb_forwarder_item.fdiscount; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder_item.fdiscount IS 'ส่วนลด';


--
-- Name: tb_forwarder_item_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_forwarder_item_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_forwarder_item_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_forwarder_item_id_seq OWNED BY public.tb_forwarder_item.id;


--
-- Name: tb_forwarder_jmf_tmp; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_forwarder_jmf_tmp (
    id bigint NOT NULL,
    idjmf bigint NOT NULL,
    datecrate timestamp without time zone,
    ip character varying(250) NOT NULL,
    fdate timestamp without time zone,
    fwarehousechina character varying(1) NOT NULL,
    ftransporttype character varying(1) NOT NULL,
    fcabinetnumber character varying(255) NOT NULL,
    fidorco character varying(30) NOT NULL,
    ftrackingchn character varying(100) NOT NULL,
    ftrackingchn2 character varying(100) NOT NULL,
    fdatetothai timestamp without time zone,
    fdatecontainerclose timestamp without time zone,
    famount integer NOT NULL,
    fdetail text NOT NULL,
    fcover character varying(255) NOT NULL,
    fimg1 character varying(23) NOT NULL,
    fimg2 character varying(23) NOT NULL,
    fimg3 character varying(23) NOT NULL,
    fimg4 character varying(23) NOT NULL,
    fproductstype character varying(1) NOT NULL,
    fweight numeric(10,2) NOT NULL,
    fwidth numeric(10,2) NOT NULL,
    flength numeric(10,2) NOT NULL,
    fheight numeric(10,2) NOT NULL,
    fvolume numeric(10,5) NOT NULL,
    fshippingservice numeric(10,2) NOT NULL,
    userid character varying(50) NOT NULL,
    crate character varying(1) NOT NULL,
    pricecrate numeric(10,2) NOT NULL,
    ftransportpricechnthb numeric(10,2) NOT NULL,
    priceother numeric(10,2) NOT NULL,
    apistatus character varying(10) NOT NULL,
    apiresult character varying(10) NOT NULL
);


--
-- Name: COLUMN tb_forwarder_jmf_tmp.fwarehousechina; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder_jmf_tmp.fwarehousechina IS '1=กวางโจว,2=อี้อู';


--
-- Name: COLUMN tb_forwarder_jmf_tmp.ftransporttype; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder_jmf_tmp.ftransporttype IS 'รูปแบบการขนส่ง';


--
-- Name: COLUMN tb_forwarder_jmf_tmp.crate; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder_jmf_tmp.crate IS '1=ตีลัง';


--
-- Name: COLUMN tb_forwarder_jmf_tmp.ftransportpricechnthb; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder_jmf_tmp.ftransportpricechnthb IS 'ค่าขนส่งจีน บาท';


--
-- Name: COLUMN tb_forwarder_jmf_tmp.priceother; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder_jmf_tmp.priceother IS 'ค่าอื่นๆ';


--
-- Name: tb_forwarder_jmf_tmp_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_forwarder_jmf_tmp_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_forwarder_jmf_tmp_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_forwarder_jmf_tmp_id_seq OWNED BY public.tb_forwarder_jmf_tmp.id;


--
-- Name: tb_forwarder_prepare; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_forwarder_prepare (
    id bigint NOT NULL,
    fid bigint NOT NULL,
    fpamount integer NOT NULL,
    fpdate timestamp without time zone,
    adminid character varying(10) NOT NULL
);


--
-- Name: tb_forwarder_prepare_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_forwarder_prepare_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_forwarder_prepare_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_forwarder_prepare_id_seq OWNED BY public.tb_forwarder_prepare.id;


--
-- Name: tb_forwarder_tran_th_h; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_forwarder_tran_th_h (
    id bigint NOT NULL,
    date timestamp without time zone,
    adminidcreate character varying(30) NOT NULL
);


--
-- Name: tb_forwarder_tran_th_h_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_forwarder_tran_th_h_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_forwarder_tran_th_h_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_forwarder_tran_th_h_id_seq OWNED BY public.tb_forwarder_tran_th_h.id;


--
-- Name: tb_forwarder_tran_th_sub; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_forwarder_tran_th_sub (
    id bigint NOT NULL,
    ftthhid bigint NOT NULL,
    fid bigint NOT NULL
);


--
-- Name: tb_forwarder_tran_th_sub_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_forwarder_tran_th_sub_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_forwarder_tran_th_sub_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_forwarder_tran_th_sub_id_seq OWNED BY public.tb_forwarder_tran_th_sub.id;


--
-- Name: tb_header_order; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_header_order (
    id bigint NOT NULL,
    hstatus character varying(1) DEFAULT '1'::character varying NOT NULL,
    hshoppay character varying(1),
    paydeposit character varying(1),
    hno character varying(30) NOT NULL,
    htitle character varying(300) NOT NULL,
    hcover character varying(500) NOT NULL,
    hcount integer NOT NULL,
    hdate timestamp without time zone,
    hdate2 timestamp without time zone,
    hdate3 timestamp without time zone,
    hdate4 timestamp without time zone,
    hdate5 timestamp without time zone,
    hdateupdate timestamp without time zone,
    hdatepayment timestamp without time zone,
    htransporttype character varying(1) NOT NULL,
    htotalpricechn numeric(10,2) NOT NULL,
    htotalpriceuser numeric(10,2) NOT NULL,
    hshippingservice numeric(10,2) DEFAULT 0.00 NOT NULL,
    hshippingchn numeric(10,2) NOT NULL,
    hpriceupdate numeric(10,2) NOT NULL,
    hrate numeric(10,2) NOT NULL,
    hratecost numeric(10,2) DEFAULT 0.00 NOT NULL,
    hcostall numeric(10,2) DEFAULT 0.00 NOT NULL,
    hcostallth numeric(10,2) DEFAULT 0.00 NOT NULL,
    hnote text NOT NULL,
    hnoteuser character varying(1) NOT NULL,
    hnoteuserread character varying(1) NOT NULL,
    hnotedate timestamp without time zone,
    hprintbill2 character varying(1) NOT NULL,
    hshipby character varying(10) NOT NULL,
    hfreeshipping character varying(1) NOT NULL,
    hwarehousechina character varying(1),
    haddressname character varying(200) NOT NULL,
    haddresslastname character varying(200) NOT NULL,
    haddressno character varying(255) NOT NULL,
    haddresssubdistrict character varying(255) NOT NULL,
    haddressdistrict character varying(255) NOT NULL,
    haddressprovince character varying(255) NOT NULL,
    haddresszipcode character varying(5) NOT NULL,
    haddressnote text NOT NULL,
    haddresstel character varying(10) NOT NULL,
    haddresstel2 character varying(10) NOT NULL,
    hprintbill character varying(1) NOT NULL,
    userid character varying(30) NOT NULL,
    adminidcreate character varying(10),
    adminid character varying(10) NOT NULL,
    hlockdate timestamp without time zone,
    adminidupdate character varying(10) NOT NULL,
    session character varying(100) NOT NULL,
    paymethod character varying(1) NOT NULL,
    crate character varying(1) NOT NULL,
    fshippingservice numeric(10,2) NOT NULL,
    adminidip character varying(30) NOT NULL
);


--
-- Name: COLUMN tb_header_order.hstatus; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_header_order.hstatus IS '1=รอดำเนินการ 2=รอชำระเงิน 3=สั่งสินค้า 4=รอร้านจีนจัดส่ง 5=สำเร็จ 6=ยกเลิกออเดอร์';


--
-- Name: COLUMN tb_header_order.hshoppay; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_header_order.hshoppay IS '1=จ่ายเงินแล้ว';


--
-- Name: COLUMN tb_header_order.paydeposit; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_header_order.paydeposit IS '1 คือ รอตรวจสอบการจ่ายเงิน';


--
-- Name: COLUMN tb_header_order.hdate2; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_header_order.hdate2 IS 'รอชำระเงิน';


--
-- Name: COLUMN tb_header_order.hdate3; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_header_order.hdate3 IS 'สั่งสินค้า';


--
-- Name: COLUMN tb_header_order.hdate4; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_header_order.hdate4 IS 'รอร้านจีนจัดส่ง';


--
-- Name: COLUMN tb_header_order.hdate5; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_header_order.hdate5 IS 'สำเร็จ';


--
-- Name: COLUMN tb_header_order.hshippingservice; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_header_order.hshippingservice IS 'ค่าบริการ 50 บาท';


--
-- Name: COLUMN tb_header_order.hshippingchn; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_header_order.hshippingchn IS 'ค่าขนส่งจีน';


--
-- Name: COLUMN tb_header_order.hratecost; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_header_order.hratecost IS 'เรทต้นทุน';


--
-- Name: COLUMN tb_header_order.hcostall; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_header_order.hcostall IS 'ราคาซื้อจริง';


--
-- Name: COLUMN tb_header_order.hnoteuser; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_header_order.hnoteuser IS '1=ยังไม่อ่าน,2or null อ่านแล้ว';


--
-- Name: COLUMN tb_header_order.hprintbill2; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_header_order.hprintbill2 IS 'ใบแจ้งหนี้';


--
-- Name: COLUMN tb_header_order.hshipby; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_header_order.hshipby IS 'บริษัทขนส่งในไทย F=ฟรี';


--
-- Name: COLUMN tb_header_order.hfreeshipping; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_header_order.hfreeshipping IS '1=สั่งซื้อช่วงจัดส่งฟรี';


--
-- Name: COLUMN tb_header_order.hwarehousechina; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_header_order.hwarehousechina IS '1=อี้อู,2=กวางโจว';


--
-- Name: COLUMN tb_header_order.paymethod; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_header_order.paymethod IS 'วิธีเก็บเงิน 1=ต้นทาง 2=ปลายทาง';


--
-- Name: COLUMN tb_header_order.crate; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_header_order.crate IS '1=ตีลัง';


--
-- Name: COLUMN tb_header_order.adminidip; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_header_order.adminidip IS 'ล่ามจีนที่ดูแล';


--
-- Name: tb_header_order_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_header_order_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_header_order_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_header_order_id_seq OWNED BY public.tb_header_order.id;


--
-- Name: tb_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_history (
    id bigint NOT NULL,
    date timestamp without time zone,
    action text NOT NULL,
    status character varying(2) NOT NULL,
    adminid character varying(20) NOT NULL
);


--
-- Name: tb_history_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_history_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_history_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_history_id_seq OWNED BY public.tb_history.id;


--
-- Name: tb_history_key; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_history_key (
    id bigint NOT NULL,
    date timestamp without time zone,
    keyword text NOT NULL,
    userid character varying(10) NOT NULL,
    type character varying(1) NOT NULL,
    apierror character varying(1) NOT NULL,
    categoryname character varying(300) NOT NULL
);


--
-- Name: COLUMN tb_history_key.type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_history_key.type IS '1=keyword,2=1688,3=taobao,4=tmall';


--
-- Name: tb_history_key_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_history_key_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_history_key_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_history_key_id_seq OWNED BY public.tb_history_key.id;


--
-- Name: tb_hs_rate_custom_cbm; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_hs_rate_custom_cbm (
    id bigint NOT NULL,
    userid character varying(30) NOT NULL,
    sourcewarehouse character varying(1) NOT NULL,
    rtransporttype character varying(1) NOT NULL,
    rproductstype character varying(1) NOT NULL,
    rcbmbefore numeric(10,2) NOT NULL,
    rcbm numeric(10,2) NOT NULL,
    adminidupdate character varying(50) NOT NULL,
    crhsid bigint NOT NULL
);


--
-- Name: tb_hs_rate_custom_cbm_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_hs_rate_custom_cbm_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_hs_rate_custom_cbm_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_hs_rate_custom_cbm_id_seq OWNED BY public.tb_hs_rate_custom_cbm.id;


--
-- Name: tb_hs_rate_custom_kg; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_hs_rate_custom_kg (
    id bigint NOT NULL,
    userid character varying(30) NOT NULL,
    sourcewarehouse character varying(1) NOT NULL,
    rtransporttype character varying(1) NOT NULL,
    rproductstype character varying(1) NOT NULL,
    rkgbefore numeric(10,2) NOT NULL,
    rkg numeric(10,2) NOT NULL,
    adminidupdate character varying(50) NOT NULL,
    crhsid bigint NOT NULL
);


--
-- Name: tb_hs_rate_custom_kg_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_hs_rate_custom_kg_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_hs_rate_custom_kg_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_hs_rate_custom_kg_id_seq OWNED BY public.tb_hs_rate_custom_kg.id;


--
-- Name: tb_keyword_product; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_keyword_product (
    id bigint NOT NULL,
    keyword character varying(255) NOT NULL,
    note character varying(255) NOT NULL,
    adminidcreate character varying(25) NOT NULL,
    date timestamp without time zone
);


--
-- Name: tb_keyword_product_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_keyword_product_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_keyword_product_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_keyword_product_id_seq OWNED BY public.tb_keyword_product.id;


--
-- Name: tb_log_forwarder_status; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_log_forwarder_status (
    id bigint NOT NULL,
    fid bigint NOT NULL,
    fstatusold character varying(2) NOT NULL,
    fstatusnew character varying(2) NOT NULL,
    adminidchange character varying(50) NOT NULL,
    fdatechange timestamp without time zone
);


--
-- Name: tb_log_forwarder_status_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_log_forwarder_status_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_log_forwarder_status_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_log_forwarder_status_id_seq OWNED BY public.tb_log_forwarder_status.id;


--
-- Name: tb_notify; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_notify (
    id bigint NOT NULL,
    title character varying(400) NOT NULL,
    content character varying(100) NOT NULL,
    datestart timestamp without time zone,
    dateexp timestamp without time zone,
    url character varying(400) NOT NULL,
    adminid character varying(10) NOT NULL
);


--
-- Name: tb_notify_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_notify_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_notify_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_notify_id_seq OWNED BY public.tb_notify.id;


--
-- Name: tb_notify_read; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_notify_read (
    id bigint NOT NULL,
    userid character varying(10) NOT NULL,
    popid bigint NOT NULL
);


--
-- Name: tb_notify_read_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_notify_read_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_notify_read_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_notify_read_id_seq OWNED BY public.tb_notify_read.id;


--
-- Name: tb_notify_sheet_ctt; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_notify_sheet_ctt (
    id bigint NOT NULL,
    date timestamp without time zone,
    numrow integer NOT NULL
);


--
-- Name: tb_notify_sheet_ctt_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_notify_sheet_ctt_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_notify_sheet_ctt_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_notify_sheet_ctt_id_seq OWNED BY public.tb_notify_sheet_ctt.id;


--
-- Name: tb_notify_wp; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_notify_wp (
    id bigint NOT NULL,
    title character varying(300) NOT NULL,
    detail text NOT NULL,
    datestart timestamp without time zone,
    dateexp timestamp without time zone,
    adminid character varying(30) NOT NULL,
    status character varying(1) NOT NULL,
    url character varying(500) NOT NULL
);


--
-- Name: COLUMN tb_notify_wp.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_notify_wp.status IS '1 คือ เห็นทั้งหมด , 2 คือ เห็นเฉพาะสามาชิก';


--
-- Name: tb_notify_wp_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_notify_wp_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_notify_wp_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_notify_wp_id_seq OWNED BY public.tb_notify_wp.id;


--
-- Name: tb_options; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_options (
    option_id bigint NOT NULL,
    option_key character varying(200) NOT NULL,
    option_value text NOT NULL
);


--
-- Name: tb_options_option_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_options_option_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_options_option_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_options_option_id_seq OWNED BY public.tb_options.option_id;


--
-- Name: tb_order; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_order (
    id integer NOT NULL,
    cdetails text NOT NULL,
    curl character varying(300) NOT NULL,
    ctitle character varying(300) NOT NULL,
    cnameshop character varying(300) DEFAULT 'pcs'::character varying NOT NULL,
    cprovider character varying(1) DEFAULT '4'::character varying NOT NULL,
    cimages character varying(300) NOT NULL,
    cprice numeric(10,2) NOT NULL,
    cshippingchn numeric(10,2) NOT NULL,
    cpriceupdate numeric(10,2) NOT NULL,
    camount integer NOT NULL,
    ccolor character varying(200) NOT NULL,
    csize character varying(200) NOT NULL,
    userid character varying(10) NOT NULL,
    hno character varying(30) NOT NULL,
    cshippingnumber character varying(500) NOT NULL,
    ctrackingnumber character varying(200) NOT NULL,
    crewallet character varying(1) NOT NULL,
    cnote character varying(255) NOT NULL,
    hwarehousename character varying(1) NOT NULL,
    hcrate character varying(1) DEFAULT '2'::character varying NOT NULL,
    hqc character varying(1) NOT NULL
);


--
-- Name: COLUMN tb_order.cnameshop; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_order.cnameshop IS 'pcs=ไม่มีชื่อร้าน';


--
-- Name: COLUMN tb_order.hwarehousename; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_order.hwarehousename IS 'โกดังรับของที่จีน 1=แสง, 2=CTT, 3=MK, 4=MX, 5=JMF';


--
-- Name: COLUMN tb_order.hcrate; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_order.hcrate IS '1=ตีลัง';


--
-- Name: COLUMN tb_order.hqc; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_order.hqc IS '1=ไม่ตรวจนับ, 2=ตรวจนับ';


--
-- Name: tb_order_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_order_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_order_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_order_id_seq OWNED BY public.tb_order.id;


--
-- Name: tb_org_email_ships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_org_email_ships (
    id bigint NOT NULL,
    adminid character varying(30) NOT NULL,
    oeid bigint NOT NULL
);


--
-- Name: COLUMN tb_org_email_ships.oeid; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_org_email_ships.oeid IS 'ID ตาราง tb_organization_email';


--
-- Name: tb_org_email_ships_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_org_email_ships_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_org_email_ships_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_org_email_ships_id_seq OWNED BY public.tb_org_email_ships.id;


--
-- Name: tb_org_line_ships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_org_line_ships (
    id bigint NOT NULL,
    adminid character varying(30) NOT NULL,
    olid bigint NOT NULL
);


--
-- Name: COLUMN tb_org_line_ships.olid; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_org_line_ships.olid IS 'ID ตาราง tb_organization_line';


--
-- Name: tb_org_line_ships_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_org_line_ships_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_org_line_ships_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_org_line_ships_id_seq OWNED BY public.tb_org_line_ships.id;


--
-- Name: tb_org_tell_ships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_org_tell_ships (
    id bigint NOT NULL,
    adminid character varying(30) NOT NULL,
    otid bigint NOT NULL
);


--
-- Name: COLUMN tb_org_tell_ships.otid; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_org_tell_ships.otid IS 'ID ตาราง tb_organization_tell';


--
-- Name: tb_org_tell_ships_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_org_tell_ships_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_org_tell_ships_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_org_tell_ships_id_seq OWNED BY public.tb_org_tell_ships.id;


--
-- Name: tb_org_wechat_ships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_org_wechat_ships (
    id bigint NOT NULL,
    adminid character varying(30) NOT NULL,
    owcid bigint NOT NULL
);


--
-- Name: COLUMN tb_org_wechat_ships.owcid; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_org_wechat_ships.owcid IS 'ID ตาราง tb_organization_wechat';


--
-- Name: tb_org_wechat_ships_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_org_wechat_ships_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_org_wechat_ships_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_org_wechat_ships_id_seq OWNED BY public.tb_org_wechat_ships.id;


--
-- Name: tb_organization_domainname; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_organization_domainname (
    id bigint NOT NULL,
    domain character varying(255) NOT NULL,
    start_date date,
    end_date date,
    pay_date date,
    note character varying(255) NOT NULL,
    adminidcreate character varying(255) NOT NULL,
    date timestamp without time zone,
    dateupdate timestamp without time zone,
    adminidupdate character varying(255) NOT NULL
);


--
-- Name: tb_organization_domainname_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_organization_domainname_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_organization_domainname_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_organization_domainname_id_seq OWNED BY public.tb_organization_domainname.id;


--
-- Name: tb_organization_email; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_organization_email (
    id bigint NOT NULL,
    date timestamp without time zone,
    dateupdate timestamp without time zone,
    email character varying(255) NOT NULL,
    emailtel character varying(30) NOT NULL,
    passemail character varying(255) NOT NULL,
    emailtype character varying(1) NOT NULL,
    adminidcreate character varying(30) NOT NULL,
    adminidupdate character varying(30) NOT NULL,
    note text NOT NULL
);


--
-- Name: COLUMN tb_organization_email.emailtype; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_organization_email.emailtype IS '1=ฟรี, 2=ซื้อ';


--
-- Name: tb_organization_email_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_organization_email_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_organization_email_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_organization_email_id_seq OWNED BY public.tb_organization_email.id;


--
-- Name: tb_organization_line; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_organization_line (
    id bigint NOT NULL,
    date timestamp without time zone,
    dateupdate timestamp without time zone,
    line character varying(255) NOT NULL,
    emailline character varying(30) NOT NULL,
    telline character varying(30) NOT NULL,
    passline character varying(255) NOT NULL,
    adminidcreate character varying(30) NOT NULL,
    adminidupdate character varying(30) NOT NULL,
    note text NOT NULL
);


--
-- Name: tb_organization_line_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_organization_line_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_organization_line_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_organization_line_id_seq OWNED BY public.tb_organization_line.id;


--
-- Name: tb_organization_tell; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_organization_tell (
    id bigint NOT NULL,
    date timestamp without time zone,
    dateupdate timestamp without time zone,
    tell character varying(20) NOT NULL,
    nameequipment character varying(255) NOT NULL,
    numberequipment character varying(255) NOT NULL,
    adminidcreate character varying(30) NOT NULL,
    adminidupdate character varying(30) NOT NULL,
    note text NOT NULL
);


--
-- Name: COLUMN tb_organization_tell.date; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_organization_tell.date IS 'วันที่สร้าง';


--
-- Name: COLUMN tb_organization_tell.dateupdate; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_organization_tell.dateupdate IS 'วันที่อัปเดต';


--
-- Name: COLUMN tb_organization_tell.tell; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_organization_tell.tell IS 'เบอร์โทร ตัดเครื่องหมายพืเศษออก';


--
-- Name: COLUMN tb_organization_tell.nameequipment; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_organization_tell.nameequipment IS 'ชื่ออุปกรณ์';


--
-- Name: COLUMN tb_organization_tell.numberequipment; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_organization_tell.numberequipment IS 'หมายเลขเครื่องโทรศัพท์';


--
-- Name: tb_organization_tell_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_organization_tell_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_organization_tell_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_organization_tell_id_seq OWNED BY public.tb_organization_tell.id;


--
-- Name: tb_organization_wechat; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_organization_wechat (
    id bigint NOT NULL,
    date timestamp without time zone,
    dateupdate timestamp without time zone,
    wechat character varying(255) NOT NULL,
    emailwechat character varying(30) NOT NULL,
    telwechat character varying(30) NOT NULL,
    passwechat character varying(255) NOT NULL,
    adminidcreate character varying(30) NOT NULL,
    adminidupdate character varying(30) NOT NULL,
    note text NOT NULL
);


--
-- Name: tb_organization_wechat_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_organization_wechat_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_organization_wechat_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_organization_wechat_id_seq OWNED BY public.tb_organization_wechat.id;


--
-- Name: tb_otp_check; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_otp_check (
    id bigint NOT NULL,
    usertel character varying(15) NOT NULL,
    pin character varying(10) NOT NULL,
    token character varying(40) NOT NULL,
    refno character varying(20) NOT NULL,
    date timestamp without time zone
);


--
-- Name: tb_otp_check_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_otp_check_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_otp_check_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_otp_check_id_seq OWNED BY public.tb_otp_check.id;


--
-- Name: tb_page_name; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_page_name (
    id integer NOT NULL,
    pagename character varying(255) NOT NULL
);


--
-- Name: tb_page_name_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_page_name_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_page_name_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_page_name_id_seq OWNED BY public.tb_page_name.id;


--
-- Name: tb_payment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_payment (
    id bigint NOT NULL,
    paydate timestamp without time zone,
    paydeposit character varying(1) NOT NULL,
    paystatus character varying(1) DEFAULT '1'::character varying NOT NULL,
    paytype character varying(1) NOT NULL,
    paydetail text NOT NULL,
    payyuan numeric(10,2) NOT NULL,
    payrate numeric(10,2) NOT NULL,
    payratecost numeric(10,2) NOT NULL,
    paythb numeric(10,2) NOT NULL,
    paythbcost numeric(10,2) NOT NULL,
    payprofitthb numeric(10,2) NOT NULL,
    paydateadmin timestamp without time zone,
    userid character varying(10) NOT NULL,
    adminid character varying(10) NOT NULL,
    adminidupdate character varying(10) NOT NULL,
    payadminidcreator character varying(10) NOT NULL,
    paylockdate timestamp without time zone,
    session character varying(100) NOT NULL,
    imagesslip character varying(250) NOT NULL,
    certifiedtruecopy character varying(250) NOT NULL,
    imagesslipadmin character varying(250) NOT NULL
);


--
-- Name: COLUMN tb_payment.certifiedtruecopy; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_payment.certifiedtruecopy IS 'ชื่อไฟล์ หนังสือเดินทางหรือบัตรประชาชน';


--
-- Name: COLUMN tb_payment.imagesslipadmin; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_payment.imagesslipadmin IS 'ชื่อไฟล์หลักฐานการทำงานของแอดมิน';


--
-- Name: tb_payment_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_payment_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_payment_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_payment_id_seq OWNED BY public.tb_payment.id;


--
-- Name: tb_pcs_logged; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_pcs_logged (
    id bigint NOT NULL,
    pcs_logged text NOT NULL,
    userid character varying(50) NOT NULL,
    basepath text NOT NULL,
    test character varying(2) NOT NULL,
    path text NOT NULL
);


--
-- Name: tb_pcs_logged_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_pcs_logged_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_pcs_logged_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_pcs_logged_id_seq OWNED BY public.tb_pcs_logged.id;


--
-- Name: tb_post_job; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_post_job (
    id bigint NOT NULL,
    companytype character varying(2) NOT NULL,
    admintype character varying(2) NOT NULL,
    department character varying(2) NOT NULL,
    section character varying(2) NOT NULL,
    jobtitle character varying(500) NOT NULL,
    amount integer NOT NULL,
    description text NOT NULL,
    qualifications text NOT NULL,
    welfarebenefit text NOT NULL,
    workingtime character varying(1000) NOT NULL,
    startdate timestamp without time zone,
    enddate timestamp without time zone,
    admincreate character varying(30) NOT NULL,
    date timestamp without time zone,
    salary character varying(500) NOT NULL
);


--
-- Name: tb_post_job_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_post_job_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_post_job_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_post_job_id_seq OWNED BY public.tb_post_job.id;


--
-- Name: tb_pro_valentine; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_pro_valentine (
    userid character varying(30) NOT NULL,
    message text NOT NULL,
    date timestamp without time zone
);


--
-- Name: COLUMN tb_pro_valentine.date; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_pro_valentine.date IS 'เวลาที่โพสต์';


--
-- Name: tb_product; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_product (
    id bigint NOT NULL,
    pproductcategory integer NOT NULL,
    pdate timestamp without time zone,
    pdateupdate timestamp without time zone,
    pnameth character varying(500) NOT NULL,
    pintro character varying(500) NOT NULL,
    pdetailth character varying(500) NOT NULL,
    pprovider character varying(1) NOT NULL,
    purl character varying(500) NOT NULL,
    pimages character varying(300) NOT NULL,
    pprice numeric(10,2) NOT NULL,
    ppricepromo numeric(10,2) NOT NULL,
    pdetail text NOT NULL,
    pproductid character varying(200) NOT NULL,
    adminid character varying(30) NOT NULL,
    adminidupdate character varying(30) NOT NULL
);


--
-- Name: COLUMN tb_product.pprovider; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_product.pprovider IS 'ร้านจีน';


--
-- Name: tb_product_category; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_product_category (
    pcid bigint NOT NULL,
    pcname character varying(300) NOT NULL,
    pcdetail character varying(500) NOT NULL
);


--
-- Name: tb_product_category_pcid_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_product_category_pcid_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_product_category_pcid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_product_category_pcid_seq OWNED BY public.tb_product_category.pcid;


--
-- Name: tb_product_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_product_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_product_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_product_id_seq OWNED BY public.tb_product.id;


--
-- Name: tb_promotion; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_promotion (
    id bigint NOT NULL,
    date timestamp without time zone,
    promoid bigint NOT NULL,
    fid bigint NOT NULL,
    hno character varying(30) NOT NULL
);


--
-- Name: tb_promotion33; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_promotion33 (
    userid character varying(30) NOT NULL,
    statuspro character varying(1) NOT NULL
);


--
-- Name: COLUMN tb_promotion33.statuspro; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_promotion33.statuspro IS '1=ยังไม่ใช้,2=ใช้โปรแล้ว';


--
-- Name: tb_promotion_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_promotion_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_promotion_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_promotion_id_seq OWNED BY public.tb_promotion.id;


--
-- Name: tb_rate_custom_cbm; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_rate_custom_cbm (
    id integer NOT NULL,
    userid character varying(10) NOT NULL,
    rtransporttype character varying(1) NOT NULL,
    sourcewarehouse character varying(1) NOT NULL,
    rproductstype character varying(1) NOT NULL,
    rcbm numeric(10,2) NOT NULL,
    adminidupdate character varying(10) NOT NULL
);


--
-- Name: tb_rate_custom_cbm_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_rate_custom_cbm_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_rate_custom_cbm_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_rate_custom_cbm_id_seq OWNED BY public.tb_rate_custom_cbm.id;


--
-- Name: tb_rate_custom_kg; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_rate_custom_kg (
    id integer NOT NULL,
    userid character varying(10) NOT NULL,
    sourcewarehouse character varying(1) NOT NULL,
    rtransporttype character varying(1) NOT NULL,
    rproductstype character varying(1) NOT NULL,
    rkg numeric(10,2) NOT NULL,
    adminidupdate character varying(10) NOT NULL
);


--
-- Name: tb_rate_custom_kg_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_rate_custom_kg_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_rate_custom_kg_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_rate_custom_kg_id_seq OWNED BY public.tb_rate_custom_kg.id;


--
-- Name: tb_rate_g_cbm; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_rate_g_cbm (
    id integer NOT NULL,
    coid character varying(10) NOT NULL,
    sourcewarehouse character varying(1) NOT NULL,
    rgtransporttype character varying(1) NOT NULL,
    rgproductstype character varying(1) NOT NULL,
    rgcbm1 numeric(10,2) NOT NULL,
    rgcbm2 numeric(10,2) NOT NULL,
    rgcbm3 numeric(10,2) NOT NULL,
    adminidupdate character varying(10) NOT NULL
);


--
-- Name: COLUMN tb_rate_g_cbm.sourcewarehouse; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_rate_g_cbm.sourcewarehouse IS 'โกดังต้นทาง : 1=กวางโจว,2=อี้อู';


--
-- Name: tb_rate_g_cbm_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_rate_g_cbm_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_rate_g_cbm_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_rate_g_cbm_id_seq OWNED BY public.tb_rate_g_cbm.id;


--
-- Name: tb_rate_g_kg; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_rate_g_kg (
    id integer NOT NULL,
    coid character varying(10) NOT NULL,
    sourcewarehouse character varying(1) NOT NULL,
    rgtransporttype character varying(1) NOT NULL,
    rgproductstype character varying(1) NOT NULL,
    rgkg1 numeric(10,2) NOT NULL,
    rgkg2 numeric(10,2) NOT NULL,
    rgkg3 numeric(10,2) NOT NULL,
    adminidupdate character varying(10) NOT NULL
);


--
-- Name: COLUMN tb_rate_g_kg.sourcewarehouse; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_rate_g_kg.sourcewarehouse IS 'โกดังต้นทาง : 1=กวางโจว,2=อี้อู';


--
-- Name: COLUMN tb_rate_g_kg.rgtransporttype; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_rate_g_kg.rgtransporttype IS 'ประเภทการขนส่ง 1=รถ,2=เรือ';


--
-- Name: tb_rate_g_kg_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_rate_g_kg_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_rate_g_kg_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_rate_g_kg_id_seq OWNED BY public.tb_rate_g_kg.id;


--
-- Name: tb_rate_vip_cbm; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_rate_vip_cbm (
    id integer NOT NULL,
    coid character varying(10) NOT NULL,
    sourcewarehouse character varying(1) NOT NULL,
    rtransporttype character varying(1) NOT NULL,
    rproductstype character varying(1) NOT NULL,
    rcbm numeric(10,2) NOT NULL,
    adminidupdate character varying(10) NOT NULL
);


--
-- Name: tb_rate_vip_cbm_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_rate_vip_cbm_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_rate_vip_cbm_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_rate_vip_cbm_id_seq OWNED BY public.tb_rate_vip_cbm.id;


--
-- Name: tb_rate_vip_kg; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_rate_vip_kg (
    id integer NOT NULL,
    coid character varying(10) NOT NULL,
    sourcewarehouse character varying(1) NOT NULL,
    rtransporttype character varying(1) NOT NULL,
    rproductstype character varying(1) NOT NULL,
    rkg numeric(10,2) NOT NULL,
    adminidupdate character varying(10) NOT NULL
);


--
-- Name: tb_rate_vip_kg_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_rate_vip_kg_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_rate_vip_kg_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_rate_vip_kg_id_seq OWNED BY public.tb_rate_vip_kg.id;


--
-- Name: tb_receipt; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_receipt (
    id bigint NOT NULL,
    rstatus character varying(1) DEFAULT '3'::character varying NOT NULL,
    rid character varying(20) NOT NULL,
    refid character varying(50) NOT NULL,
    rdatecreate timestamp without time zone,
    rdate timestamp without time zone,
    issuedate timestamp without time zone,
    ramount numeric(10,2) NOT NULL,
    totalbeforewithholding numeric(10,2) NOT NULL,
    adminid character varying(30) NOT NULL,
    userid character varying(30) NOT NULL,
    statusprint character varying(1) NOT NULL,
    adminidprint character varying(30) NOT NULL,
    rdateprint timestamp without time zone,
    statusprintcopy character varying(1) NOT NULL,
    rdateprintcopy timestamp without time zone,
    adminidprintcopy character varying(30) NOT NULL,
    recompnumber character varying(13) NOT NULL,
    recompname character varying(300) NOT NULL,
    recompaddress text NOT NULL,
    rpopup character varying(1) NOT NULL,
    corporatetype character varying(1) NOT NULL,
    documentissuer character varying(300) NOT NULL,
    documentapprover character varying(300) NOT NULL,
    refwhid bigint
);


--
-- Name: COLUMN tb_receipt.rid; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_receipt.rid IS 'PCS221002-1';


--
-- Name: COLUMN tb_receipt.refid; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_receipt.refid IS 'เลขอ้างอิง เช่น ใบแจ้งหนี้';


--
-- Name: COLUMN tb_receipt.rdatecreate; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_receipt.rdatecreate IS 'วันที่สร้าง';


--
-- Name: COLUMN tb_receipt.rdate; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_receipt.rdate IS '	วันเวลาที่ทำรายการผ่านระบบ pcs wallet';


--
-- Name: COLUMN tb_receipt.issuedate; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_receipt.issuedate IS 'วันที่ออกเอกสาร';


--
-- Name: COLUMN tb_receipt.ramount; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_receipt.ramount IS 'ยอดที่จ่ายจริงมา ยอดหลังหัก ณ ที่จ่าย';


--
-- Name: COLUMN tb_receipt.totalbeforewithholding; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_receipt.totalbeforewithholding IS 'ยอดก่อน หัก ณ ที่จ่าย';


--
-- Name: COLUMN tb_receipt.statusprint; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_receipt.statusprint IS '1=print แล้ว';


--
-- Name: COLUMN tb_receipt.rpopup; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_receipt.rpopup IS '1=กดดู popup แล้ว';


--
-- Name: COLUMN tb_receipt.corporatetype; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_receipt.corporatetype IS '1=ลูกค้าบริษัท, 2=ลูกค้าทั่วไป';


--
-- Name: COLUMN tb_receipt.documentissuer; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_receipt.documentissuer IS 'ผู้ออกเอกสารเอาชื่อ-นามสกุลมาเลย';


--
-- Name: COLUMN tb_receipt.documentapprover; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_receipt.documentapprover IS 'ผู้อนุมัติเอกสารเอาชื่อ-นามสกุลมาเลย';


--
-- Name: COLUMN tb_receipt.refwhid; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_receipt.refwhid IS 'อ้างอิงรายการเติมเงิน';


--
-- Name: tb_receipt_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_receipt_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_receipt_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_receipt_id_seq OWNED BY public.tb_receipt.id;


--
-- Name: tb_receipt_item; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_receipt_item (
    id bigint NOT NULL,
    rid character varying(30) NOT NULL,
    fid bigint NOT NULL
);


--
-- Name: tb_receipt_item_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_receipt_item_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_receipt_item_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_receipt_item_id_seq OWNED BY public.tb_receipt_item.id;


--
-- Name: tb_register; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_register (
    id bigint NOT NULL,
    type character varying(1) NOT NULL,
    corporatenumber character varying(13) NOT NULL,
    corporatename character varying(300) NOT NULL,
    corporateaddress text NOT NULL,
    corporatefile character varying(200) NOT NULL,
    corporatefile20 character varying(200) NOT NULL,
    usertel character varying(13) NOT NULL,
    userpass character varying(80) NOT NULL,
    username character varying(200) NOT NULL,
    userlastname character varying(200) NOT NULL,
    useremail character varying(100) NOT NULL,
    shopuser character varying(1) NOT NULL,
    channel character varying(2) NOT NULL,
    userregistered timestamp without time zone,
    userregisterwith character varying(3) NOT NULL,
    coid character varying(10) DEFAULT 'PCS'::character varying NOT NULL,
    adminidsale character varying(30) NOT NULL,
    userpicture character varying(150) DEFAULT 'user.jpg'::character varying NOT NULL,
    userrecom character varying(20) NOT NULL,
    token character varying(40) NOT NULL,
    refno character varying(20) NOT NULL,
    pin character varying(10) NOT NULL
);


--
-- Name: COLUMN tb_register.type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_register.type IS '1=ทั่วไป,2=นิติบุคคล ';


--
-- Name: COLUMN tb_register.corporatefile; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_register.corporatefile IS 'หนังสือรับรอง';


--
-- Name: COLUMN tb_register.corporatefile20; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_register.corporatefile20 IS 'ภพ20';


--
-- Name: COLUMN tb_register.shopuser; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_register.shopuser IS '1=ซื้อไปใข้เอง';


--
-- Name: COLUMN tb_register.channel; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_register.channel IS 'รู้จักเราจากช่องทางใด';


--
-- Name: COLUMN tb_register.userregisterwith; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_register.userregisterwith IS 'วิธีสมัครสมาชิก PCS=สมาชิกในระบบ,F=เฟสบุ๊ก,L=ไลน์	';


--
-- Name: COLUMN tb_register.coid; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_register.coid IS '	กลุ่มลูกค้า PCS=ลูกค้าทั่วไป';


--
-- Name: COLUMN tb_register.pin; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_register.pin IS 'OTP';


--
-- Name: tb_register_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_register_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_register_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_register_id_seq OWNED BY public.tb_register.id;


--
-- Name: tb_sales_report; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_sales_report (
    id bigint NOT NULL,
    srdate timestamp without time zone,
    fid bigint NOT NULL,
    sradminidsale character varying(20) NOT NULL
);


--
-- Name: COLUMN tb_sales_report.srdate; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_sales_report.srdate IS 'วันที่ลูกค้าชำระ';


--
-- Name: COLUMN tb_sales_report.fid; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_sales_report.fid IS 'เลขที่ออเดอร์ฝากนำเข้า';


--
-- Name: tb_sales_report_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_sales_report_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_sales_report_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_sales_report_id_seq OWNED BY public.tb_sales_report.id;


--
-- Name: tb_set_comm_interpreter; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_set_comm_interpreter (
    id bigint NOT NULL,
    percom numeric(10,2) NOT NULL,
    adminid character varying(20) NOT NULL,
    adminidupdate character varying(20) NOT NULL,
    dateupdate timestamp without time zone
);


--
-- Name: tb_set_comm_interpreter_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_set_comm_interpreter_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_set_comm_interpreter_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_set_comm_interpreter_id_seq OWNED BY public.tb_set_comm_interpreter.id;


--
-- Name: tb_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_settings (
    id integer NOT NULL,
    rgdefault numeric(10,2) NOT NULL,
    rsdefault numeric(10,2) NOT NULL,
    rpdefault numeric(10,2) NOT NULL,
    hratecostdefault numeric(10,2),
    hratecostsale numeric(10,2) NOT NULL,
    numberpaymemt character varying(1000) NOT NULL,
    freeshipping character varying(1) NOT NULL,
    fcostcar1default numeric(10,2) NOT NULL,
    fcostcar2default numeric(10,2) NOT NULL,
    fcostcar3default numeric(10,2) NOT NULL,
    fcostcar4default numeric(10,2) NOT NULL,
    fcostcar1default2 numeric(10,2) DEFAULT 0.00 NOT NULL,
    fcostcar2default2 numeric(10,2) DEFAULT 0.00 NOT NULL,
    fcostcar3default2 numeric(10,2) DEFAULT 0.00 NOT NULL,
    fcostcar4default2 numeric(10,2) DEFAULT 0.00 NOT NULL,
    fcostship1default numeric(10,2) NOT NULL,
    fcostship2default numeric(10,2) NOT NULL,
    fcostship3default numeric(10,2) NOT NULL,
    fcostship4default numeric(10,2) NOT NULL,
    fcostship1default2 numeric(10,2) NOT NULL,
    fcostship2default2 numeric(10,2) NOT NULL,
    fcostship3default2 numeric(10,2) NOT NULL,
    fcostship4default2 numeric(10,2) NOT NULL,
    fcostcar1defaultsang numeric(10,2) NOT NULL,
    fcostcar2defaultsang numeric(10,2) NOT NULL,
    fcostcar3defaultsang numeric(10,2) NOT NULL,
    fcostcar4defaultsang numeric(10,2) NOT NULL,
    fcostship1defaultsang numeric(10,2) NOT NULL,
    fcostship2defaultsang numeric(10,2) NOT NULL,
    fcostship3defaultsang numeric(10,2) NOT NULL,
    fcostship4defaultsang numeric(10,2) NOT NULL,
    fcostcar1defaultsang2 numeric(10,2) NOT NULL,
    fcostcar2defaultsang2 numeric(10,2) NOT NULL,
    fcostcar3defaultsang2 numeric(10,2) NOT NULL,
    fcostcar4defaultsang2 numeric(10,2) NOT NULL,
    fcostship1defaultsang2 numeric(10,2) NOT NULL,
    fcostship2defaultsang2 numeric(10,2) NOT NULL,
    fcostship3defaultsang2 numeric(10,2) NOT NULL,
    fcostship4defaultsang2 numeric(10,2) NOT NULL,
    fcostcar1defaultmkcargo numeric(10,2) NOT NULL,
    fcostcar2defaultmkcargo numeric(10,2) NOT NULL,
    fcostcar3defaultmkcargo numeric(10,2) NOT NULL,
    fcostcar4defaultmkcargo numeric(10,2) NOT NULL,
    fcostship1defaultmkcargo numeric(10,2) NOT NULL,
    fcostship2defaultmkcargo numeric(10,2) NOT NULL,
    fcostship3defaultmkcargo numeric(10,2) NOT NULL,
    fcostship4defaultmkcargo numeric(10,2) NOT NULL,
    fcostcar1defaultmkcargo2 numeric(10,2) NOT NULL,
    fcostcar2defaultmkcargo2 numeric(10,2) NOT NULL,
    fcostcar3defaultmkcargo2 numeric(10,2) NOT NULL,
    fcostcar4defaultmkcargo2 numeric(10,2) NOT NULL,
    fcostship1defaultmkcargo2 numeric(10,2) NOT NULL,
    fcostship2defaultmkcargo2 numeric(10,2) NOT NULL,
    fcostship3defaultmkcargo2 numeric(10,2) NOT NULL,
    fcostship4defaultmkcargo2 numeric(10,2) NOT NULL,
    fcostcar1defaultmxcargo numeric(10,2) NOT NULL,
    fcostcar2defaultmxcargo numeric(10,2) NOT NULL,
    fcostcar3defaultmxcargo numeric(10,2) NOT NULL,
    fcostcar4defaultmxcargo numeric(10,2) NOT NULL,
    fcostship1defaultmxcargo numeric(10,2) NOT NULL,
    fcostship2defaultmxcargo numeric(10,2) NOT NULL,
    fcostship3defaultmxcargo numeric(10,2) NOT NULL,
    fcostship4defaultmxcargo numeric(10,2) NOT NULL,
    fcostcar1defaultwmxcargo numeric(10,2) NOT NULL,
    fcostcar2defaultwmxcargo numeric(10,2) NOT NULL,
    fcostcar3defaultwmxcargo numeric(10,2) NOT NULL,
    fcostcar4defaultwmxcargo numeric(10,2) NOT NULL,
    fcostship1defaultwmxcargo numeric(10,2) NOT NULL,
    fcostship2defaultwmxcargo numeric(10,2) NOT NULL,
    fcostship3defaultwmxcargo numeric(10,2) NOT NULL,
    fcostship4defaultwmxcargo numeric(10,2) NOT NULL,
    fcostcar1defaultmxcargo2 numeric(10,2) NOT NULL,
    fcostcar2defaultmxcargo2 numeric(10,2) NOT NULL,
    fcostcar3defaultmxcargo2 numeric(10,2) NOT NULL,
    fcostcar4defaultmxcargo2 numeric(10,2) NOT NULL,
    fcostship1defaultmxcargo2 numeric(10,2) NOT NULL,
    fcostship2defaultmxcargo2 numeric(10,2) NOT NULL,
    fcostship3defaultmxcargo2 numeric(10,2) NOT NULL,
    fcostship4defaultmxcargo2 numeric(10,2) NOT NULL,
    fcostcar1defaultwmxcargo2 numeric(10,2) NOT NULL,
    fcostcar2defaultwmxcargo2 numeric(10,2) NOT NULL,
    fcostcar3defaultwmxcargo2 numeric(10,2) NOT NULL,
    fcostcar4defaultwmxcargo2 numeric(10,2) NOT NULL,
    fcostship1defaultwmxcargo2 numeric(10,2) NOT NULL,
    fcostship2defaultwmxcargo2 numeric(10,2) NOT NULL,
    fcostship3defaultwmxcargo2 numeric(10,2) NOT NULL,
    fcostship4defaultwmxcargo2 numeric(10,2) NOT NULL,
    fcostcar1defaultjmf numeric(10,2) NOT NULL,
    fcostcar2defaultjmf2 numeric(10,2) NOT NULL,
    fcostcar2defaultjmf numeric(10,2) NOT NULL,
    fcostcar3defaultjmf2 numeric(10,2) NOT NULL,
    fcostcar3defaultjmf numeric(10,2) NOT NULL,
    fcostcar4defaultjmf2 numeric(10,2) NOT NULL,
    fcostship1defaultjmf numeric(10,2) NOT NULL,
    fcostship2defaultjmf2 numeric(10,2) NOT NULL,
    fcostship2defaultjmf numeric(10,2) NOT NULL,
    fcostship3defaultjmf2 numeric(10,2) NOT NULL,
    fcostship3defaultjmf numeric(10,2) NOT NULL,
    fcostship4defaultjmf2 numeric(10,2) NOT NULL,
    fcostship4defaultjmf numeric(10,2) NOT NULL,
    fcostship1defaultjmf2 numeric(10,2) NOT NULL,
    fcostcar4defaultjmf numeric(10,2) NOT NULL,
    fcostcar1defaultjmf2 numeric(10,2) NOT NULL,
    fcostcar1defaultgogo numeric(10,2) NOT NULL,
    fcostcar2defaultgogo numeric(10,2) NOT NULL,
    fcostcar3defaultgogo numeric(10,2) NOT NULL,
    fcostcar4defaultgogo numeric(10,2) NOT NULL,
    fcostcar1defaultgogo2 numeric(10,2) NOT NULL,
    fcostcar2defaultgogo2 numeric(10,2) NOT NULL,
    fcostcar3defaultgogo2 numeric(10,2) NOT NULL,
    fcostcar4defaultgogo2 numeric(10,2) NOT NULL,
    fcostship1defaultgogo numeric(10,2) NOT NULL,
    fcostship2defaultgogo numeric(10,2) NOT NULL,
    fcostship3defaultgogo numeric(10,2) NOT NULL,
    fcostship4defaultgogo numeric(10,2) NOT NULL,
    fcostship1defaultgogo2 numeric(10,2) NOT NULL,
    fcostship2defaultgogo2 numeric(10,2) NOT NULL,
    fcostship3defaultgogo2 numeric(10,2) NOT NULL,
    fcostship4defaultgogo2 numeric(10,2) NOT NULL,
    fcostcar1defaultcargocenter numeric(10,2) NOT NULL,
    fcostcar2defaultcargocenter numeric(10,2) NOT NULL,
    fcostcar3defaultcargocenter numeric(10,2) NOT NULL,
    fcostcar4defaultcargocenter numeric(10,2) NOT NULL,
    fcostcar1defaultcargocenter2 numeric(10,2) NOT NULL,
    fcostcar2defaultcargocenter2 numeric(10,2) NOT NULL,
    fcostcar3defaultcargocenter2 numeric(10,2) NOT NULL,
    fcostcar4defaultcargocenter2 numeric(10,2) NOT NULL,
    fcostship1defaultcargocenter numeric(10,2) NOT NULL,
    fcostship2defaultcargocenter numeric(10,2) NOT NULL,
    fcostship3defaultcargocenter numeric(10,2) NOT NULL,
    fcostship4defaultcargocenter numeric(10,2) NOT NULL,
    fcostship1defaultcargocenter2 numeric(10,2) NOT NULL,
    fcostship2defaultcargocenter2 numeric(10,2) NOT NULL,
    fcostship3defaultcargocenter2 numeric(10,2) NOT NULL,
    fcostship4defaultcargocenter2 numeric(10,2) NOT NULL,
    fcostcar1defaultmomo numeric(10,2) NOT NULL,
    fcostcar2defaultmomo numeric(10,2) NOT NULL,
    fcostcar3defaultmomo numeric(10,2) NOT NULL,
    fcostcar4defaultmomo numeric(10,2) NOT NULL,
    fcostcar1defaultmomo2 numeric(10,2) NOT NULL,
    fcostcar2defaultmomo2 numeric(10,2) NOT NULL,
    fcostcar3defaultmomo2 numeric(10,2) NOT NULL,
    fcostcar4defaultmomo2 numeric(10,2) NOT NULL,
    fcostship1defaultmomo numeric(10,2) NOT NULL,
    fcostship2defaultmomo numeric(10,2) NOT NULL,
    fcostship3defaultmomo numeric(10,2) NOT NULL,
    fcostship4defaultmomo numeric(10,2) NOT NULL,
    fcostship1defaultmomo2 numeric(10,2) NOT NULL,
    fcostship2defaultmomo2 numeric(10,2) NOT NULL,
    fcostship3defaultmomo2 numeric(10,2) NOT NULL,
    fcostship4defaultmomo2 numeric(10,2) NOT NULL
);


--
-- Name: COLUMN tb_settings.hratecostdefault; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_settings.hratecostdefault IS 'ต้นทุนเรทตั้งต้น';


--
-- Name: COLUMN tb_settings.fcostcar1defaultgogo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_settings.fcostcar1defaultgogo IS 'กวางโจว ทางรถ ทั่วไป';


--
-- Name: COLUMN tb_settings.fcostcar2defaultgogo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_settings.fcostcar2defaultgogo IS 'กวางโจว ทางรถ มอก';


--
-- Name: COLUMN tb_settings.fcostcar3defaultgogo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_settings.fcostcar3defaultgogo IS 'กวางโจว ทางรถ อย';


--
-- Name: COLUMN tb_settings.fcostcar4defaultgogo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_settings.fcostcar4defaultgogo IS 'กวางโจว ทางรถ พิเศษ';


--
-- Name: COLUMN tb_settings.fcostcar1defaultgogo2; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_settings.fcostcar1defaultgogo2 IS 'กวางโจว ทางรถ ทั่วไป';


--
-- Name: COLUMN tb_settings.fcostcar2defaultgogo2; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_settings.fcostcar2defaultgogo2 IS 'กวางโจว ทางรถ มอก';


--
-- Name: COLUMN tb_settings.fcostcar3defaultgogo2; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_settings.fcostcar3defaultgogo2 IS 'กวางโจว ทางรถ อย';


--
-- Name: COLUMN tb_settings.fcostcar4defaultgogo2; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_settings.fcostcar4defaultgogo2 IS 'กวางโจว ทางรถ พิเศษ';


--
-- Name: COLUMN tb_settings.fcostship1defaultgogo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_settings.fcostship1defaultgogo IS 'กวางโจว ทางเรือ ทั่วไป';


--
-- Name: COLUMN tb_settings.fcostship2defaultgogo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_settings.fcostship2defaultgogo IS 'กวางโจว ทางเรือ มอก';


--
-- Name: COLUMN tb_settings.fcostship3defaultgogo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_settings.fcostship3defaultgogo IS 'กวางโจว ทางเรือ อย';


--
-- Name: COLUMN tb_settings.fcostship4defaultgogo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_settings.fcostship4defaultgogo IS 'กวางโจว ทางเรือ พิเศษ';


--
-- Name: COLUMN tb_settings.fcostship1defaultgogo2; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_settings.fcostship1defaultgogo2 IS 'กวางโจว ทางเรือ ทั่วไป';


--
-- Name: COLUMN tb_settings.fcostship2defaultgogo2; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_settings.fcostship2defaultgogo2 IS 'กวางโจว ทางเรือ มอก';


--
-- Name: COLUMN tb_settings.fcostship3defaultgogo2; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_settings.fcostship3defaultgogo2 IS 'กวางโจว ทางเรือ อย';


--
-- Name: COLUMN tb_settings.fcostship4defaultgogo2; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_settings.fcostship4defaultgogo2 IS 'กวางโจว ทางเรือ พิเศษ';


--
-- Name: COLUMN tb_settings.fcostcar1defaultcargocenter; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_settings.fcostcar1defaultcargocenter IS 'กวางโจว ทางรถ ทั่วไป';


--
-- Name: COLUMN tb_settings.fcostcar2defaultcargocenter; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_settings.fcostcar2defaultcargocenter IS 'กวางโจว ทางรถ มอก';


--
-- Name: COLUMN tb_settings.fcostcar3defaultcargocenter; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_settings.fcostcar3defaultcargocenter IS 'กวางโจว ทางรถ อย';


--
-- Name: COLUMN tb_settings.fcostcar4defaultcargocenter; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_settings.fcostcar4defaultcargocenter IS 'กวางโจว ทางรถ พิเศษ';


--
-- Name: COLUMN tb_settings.fcostcar1defaultcargocenter2; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_settings.fcostcar1defaultcargocenter2 IS 'กวางโจว ทางรถ ทั่วไป';


--
-- Name: COLUMN tb_settings.fcostcar2defaultcargocenter2; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_settings.fcostcar2defaultcargocenter2 IS 'กวางโจว ทางรถ มอก';


--
-- Name: COLUMN tb_settings.fcostcar3defaultcargocenter2; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_settings.fcostcar3defaultcargocenter2 IS 'กวางโจว ทางรถ อย';


--
-- Name: COLUMN tb_settings.fcostcar4defaultcargocenter2; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_settings.fcostcar4defaultcargocenter2 IS 'กวางโจว ทางรถ พิเศษ';


--
-- Name: COLUMN tb_settings.fcostship1defaultcargocenter; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_settings.fcostship1defaultcargocenter IS 'กวางโจว ทางเรือ ทั่วไป';


--
-- Name: COLUMN tb_settings.fcostship2defaultcargocenter; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_settings.fcostship2defaultcargocenter IS 'กวางโจว ทางเรือ มอก';


--
-- Name: COLUMN tb_settings.fcostship3defaultcargocenter; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_settings.fcostship3defaultcargocenter IS 'กวางโจว ทางเรือ อย';


--
-- Name: COLUMN tb_settings.fcostship4defaultcargocenter; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_settings.fcostship4defaultcargocenter IS 'กวางโจว ทางเรือ พิเศษ';


--
-- Name: COLUMN tb_settings.fcostship1defaultcargocenter2; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_settings.fcostship1defaultcargocenter2 IS 'กวางโจว ทางเรือ ทั่วไป';


--
-- Name: COLUMN tb_settings.fcostship2defaultcargocenter2; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_settings.fcostship2defaultcargocenter2 IS 'กวางโจว ทางเรือ มอก';


--
-- Name: COLUMN tb_settings.fcostship3defaultcargocenter2; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_settings.fcostship3defaultcargocenter2 IS 'กวางโจว ทางเรือ อย';


--
-- Name: COLUMN tb_settings.fcostship4defaultcargocenter2; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_settings.fcostship4defaultcargocenter2 IS 'กวางโจว ทางเรือ พิเศษ';


--
-- Name: tb_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_settings_id_seq OWNED BY public.tb_settings.id;


--
-- Name: tb_shop_pay_h; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_shop_pay_h (
    id bigint NOT NULL,
    date timestamp without time zone,
    dateupdate timestamp without time zone,
    amount numeric(10,2) NOT NULL,
    title character varying(300) NOT NULL,
    status character varying(1) NOT NULL,
    adminidcreate character varying(30) NOT NULL,
    namebank character varying(2) NOT NULL,
    nameuserbank character varying(200) NOT NULL,
    nouserbank character varying(200) NOT NULL,
    imagesslip character varying(300) NOT NULL,
    adminidupdate character varying(30) NOT NULL
);


--
-- Name: COLUMN tb_shop_pay_h.amount; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_shop_pay_h.amount IS 'จำนวนที่โอน';


--
-- Name: COLUMN tb_shop_pay_h.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_shop_pay_h.status IS '1=รอดำเนินการ, 2=สำเร็จ';


--
-- Name: COLUMN tb_shop_pay_h.adminidcreate; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_shop_pay_h.adminidcreate IS 'แอดมินสร้างรายการ';


--
-- Name: COLUMN tb_shop_pay_h.namebank; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_shop_pay_h.namebank IS 'ธนาคารปลายทางที่รับเงิน';


--
-- Name: COLUMN tb_shop_pay_h.nameuserbank; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_shop_pay_h.nameuserbank IS 'ชื่อบัญชีรับเงินคืน';


--
-- Name: COLUMN tb_shop_pay_h.nouserbank; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_shop_pay_h.nouserbank IS 'เลขที่บัญชีโอนเงินคืน';


--
-- Name: COLUMN tb_shop_pay_h.adminidupdate; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_shop_pay_h.adminidupdate IS 'แอดมินทำรายการ';


--
-- Name: tb_shop_pay_h_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_shop_pay_h_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_shop_pay_h_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_shop_pay_h_id_seq OWNED BY public.tb_shop_pay_h.id;


--
-- Name: tb_shop_pay_sub; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_shop_pay_sub (
    id bigint NOT NULL,
    hno character varying(30) NOT NULL,
    sphid bigint NOT NULL,
    hcostallth numeric(10,2) NOT NULL
);


--
-- Name: tb_shop_pay_sub_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_shop_pay_sub_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_shop_pay_sub_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_shop_pay_sub_id_seq OWNED BY public.tb_shop_pay_sub.id;


--
-- Name: tb_sms_hs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_sms_hs (
    id bigint NOT NULL,
    date timestamp without time zone,
    msisdn text NOT NULL,
    message text NOT NULL,
    status character varying(1) NOT NULL
);


--
-- Name: tb_sms_hs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_sms_hs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_sms_hs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_sms_hs_id_seq OWNED BY public.tb_sms_hs.id;


--
-- Name: tb_sms_statistic; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_sms_statistic (
    id bigint NOT NULL,
    date timestamp without time zone,
    browser character varying(80) NOT NULL,
    browserversion character varying(20) NOT NULL,
    ip character varying(20) NOT NULL,
    getdevice character varying(30) NOT NULL,
    userid character varying(20) NOT NULL
);


--
-- Name: tb_sms_statistic9; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_sms_statistic9 (
    id bigint NOT NULL,
    date timestamp without time zone,
    browser character varying(80) NOT NULL,
    browserversion character varying(20) NOT NULL,
    ip character varying(20) NOT NULL,
    getdevice character varying(30) NOT NULL,
    userid character varying(20) NOT NULL
);


--
-- Name: tb_sms_statistic9_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_sms_statistic9_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_sms_statistic9_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_sms_statistic9_id_seq OWNED BY public.tb_sms_statistic9.id;


--
-- Name: tb_sms_statistic_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_sms_statistic_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_sms_statistic_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_sms_statistic_id_seq OWNED BY public.tb_sms_statistic.id;


--
-- Name: tb_survey; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_survey (
    id bigint NOT NULL,
    userid character varying(30) NOT NULL,
    usersex character varying(200) NOT NULL,
    userbirthday character varying(20) NOT NULL,
    occupation character varying(200) NOT NULL,
    usedpcs text NOT NULL,
    serviceintroduction character varying(100) NOT NULL,
    problems text NOT NULL,
    forwarder text NOT NULL,
    shop text NOT NULL,
    promotion text NOT NULL,
    date timestamp without time zone
);


--
-- Name: tb_survey202306; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_survey202306 (
    id bigint NOT NULL,
    date timestamp without time zone,
    userid character varying(30) NOT NULL,
    usersex character varying(200) NOT NULL,
    occupation character varying(200) NOT NULL,
    usedpcs text NOT NULL,
    problems text NOT NULL,
    adjust text NOT NULL,
    readblog character varying(100) NOT NULL,
    benefitblog text NOT NULL,
    promotion text NOT NULL,
    addservice text NOT NULL,
    recommend character varying(100) NOT NULL
);


--
-- Name: tb_survey202306_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_survey202306_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_survey202306_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_survey202306_id_seq OWNED BY public.tb_survey202306.id;


--
-- Name: tb_survey_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_survey_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_survey_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_survey_id_seq OWNED BY public.tb_survey.id;


--
-- Name: tb_terms_service; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_terms_service (
    id bigint NOT NULL,
    userid character varying(30) NOT NULL,
    date timestamp without time zone,
    version character varying(20) NOT NULL
);


--
-- Name: COLUMN tb_terms_service.date; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_terms_service.date IS 'เวลากดยอมรับเงื่อนไข';


--
-- Name: COLUMN tb_terms_service.version; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_terms_service.version IS 'เวอร์ชันของเงื่อนไขการใช้บริการ';


--
-- Name: tb_terms_service_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_terms_service_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_terms_service_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_terms_service_id_seq OWNED BY public.tb_terms_service.id;


--
-- Name: tb_tmp_forwarder_cargothai; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_tmp_forwarder_cargothai (
    id bigint NOT NULL,
    container_name character varying(255),
    container_code character varying(255),
    due_date timestamp without time zone,
    box_total integer,
    box_weight numeric(10,2),
    box_cbm numeric(10,6),
    sm_code character varying(255),
    sm_date timestamp without time zone,
    manifest_date timestamp without time zone,
    estimated_date timestamp without time zone,
    etd timestamp without time zone,
    eta timestamp without time zone,
    re timestamp without time zone,
    created_at timestamp without time zone,
    note text,
    note_amount integer,
    transport_name character varying(255),
    transport_code character varying(255),
    warehouse_name character varying(255),
    warehouse_code character varying(255),
    status character varying(255),
    status_date timestamp without time zone,
    sm character varying(255),
    userid character varying(255),
    hno character varying(255),
    api_lasttimeupdated timestamp without time zone
);


--
-- Name: COLUMN tb_tmp_forwarder_cargothai.note_amount; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_tmp_forwarder_cargothai.note_amount IS 'หน่วยหยวน';


--
-- Name: tb_tmp_forwarder_cargothai_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_tmp_forwarder_cargothai_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_tmp_forwarder_cargothai_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_tmp_forwarder_cargothai_id_seq OWNED BY public.tb_tmp_forwarder_cargothai.id;


--
-- Name: tb_tmp_forwarder_item_cargothai; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_tmp_forwarder_item_cargothai (
    id bigint NOT NULL,
    productid bigint NOT NULL,
    productname character varying(255) NOT NULL,
    producttracking character varying(255) NOT NULL,
    producttrackingnote text NOT NULL,
    productqty integer NOT NULL,
    productbagid bigint NOT NULL,
    productwidth numeric(10,2) NOT NULL,
    productlength numeric(10,2) NOT NULL,
    productheight numeric(10,2) NOT NULL,
    productweightperitem numeric(10,2) NOT NULL,
    productweightall numeric(10,2) NOT NULL,
    productcbmperitem numeric(10,6) NOT NULL,
    productcbmall numeric(10,6) NOT NULL,
    productweightformat character varying(100) NOT NULL,
    producttypecode character varying(5) NOT NULL,
    containercode character varying(200) NOT NULL,
    userid character varying(50) NOT NULL,
    fid bigint NOT NULL,
    date timestamp without time zone,
    lasttimeupdated timestamp without time zone,
    adminid character varying(50) NOT NULL,
    adminidupdated character varying(50) NOT NULL,
    domesticshippingchina numeric(10,2) NOT NULL,
    chinawoodencratefeetype character varying(1) NOT NULL,
    chinawoodencratefee numeric(10,2) NOT NULL,
    otherservicefee numeric(10,2) NOT NULL,
    thailanddeliveryfee numeric(10,2) NOT NULL,
    frefprice character varying(1) NOT NULL,
    fqc character varying(1) NOT NULL,
    fqcprice numeric(10,2) NOT NULL,
    fpriceupdate numeric(10,2) NOT NULL,
    fdiscount numeric(10,2) NOT NULL,
    sm_code character varying(255) NOT NULL,
    sm character varying(255) NOT NULL,
    container_code character varying(255) NOT NULL,
    productcostchn numeric(10,2) NOT NULL,
    transport_code character varying(5) NOT NULL
);


--
-- Name: COLUMN tb_tmp_forwarder_item_cargothai.adminid; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_tmp_forwarder_item_cargothai.adminid IS 'แอดมินที่สร้าง';


--
-- Name: COLUMN tb_tmp_forwarder_item_cargothai.adminidupdated; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_tmp_forwarder_item_cargothai.adminidupdated IS 'แอดมินที่แก้ไขล่าสุด';


--
-- Name: COLUMN tb_tmp_forwarder_item_cargothai.domesticshippingchina; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_tmp_forwarder_item_cargothai.domesticshippingchina IS 'ค่าขนส่งในจีน เดิมใน tb_forwarder fTransportPriceCHNTHB';


--
-- Name: COLUMN tb_tmp_forwarder_item_cargothai.chinawoodencratefeetype; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_tmp_forwarder_item_cargothai.chinawoodencratefeetype IS 'ตีลังไม้ 1=ไม่ตี, 2=ตีลัง เดิม tb_forwarder crate';


--
-- Name: COLUMN tb_tmp_forwarder_item_cargothai.chinawoodencratefee; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_tmp_forwarder_item_cargothai.chinawoodencratefee IS 'ค่าตีลังไม้';


--
-- Name: COLUMN tb_tmp_forwarder_item_cargothai.otherservicefee; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_tmp_forwarder_item_cargothai.otherservicefee IS 'ค่าบริการอื่น ๆ';


--
-- Name: COLUMN tb_tmp_forwarder_item_cargothai.thailanddeliveryfee; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_tmp_forwarder_item_cargothai.thailanddeliveryfee IS 'ค่าขนส่งในไทย';


--
-- Name: COLUMN tb_tmp_forwarder_item_cargothai.frefprice; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_tmp_forwarder_item_cargothai.frefprice IS 'คิดเรทนำเข้าตาม 1=น้ำหนัก 2=ปริมาตร';


--
-- Name: COLUMN tb_tmp_forwarder_item_cargothai.fqc; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_tmp_forwarder_item_cargothai.fqc IS '	1=ไม่ตรวจนับ, 2=ตรวจนับ';


--
-- Name: COLUMN tb_tmp_forwarder_item_cargothai.fqcprice; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_tmp_forwarder_item_cargothai.fqcprice IS 'ค่า QC สินค้า';


--
-- Name: COLUMN tb_tmp_forwarder_item_cargothai.fpriceupdate; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_tmp_forwarder_item_cargothai.fpriceupdate IS 'ราคาที่เก็บเพิ่มมาจากฝากนำเข้า';


--
-- Name: COLUMN tb_tmp_forwarder_item_cargothai.fdiscount; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_tmp_forwarder_item_cargothai.fdiscount IS 'ส่วนลด';


--
-- Name: COLUMN tb_tmp_forwarder_item_cargothai.productcostchn; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_tmp_forwarder_item_cargothai.productcostchn IS 'note_amount';


--
-- Name: tb_tmp_forwarder_item_cargothai_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_tmp_forwarder_item_cargothai_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_tmp_forwarder_item_cargothai_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_tmp_forwarder_item_cargothai_id_seq OWNED BY public.tb_tmp_forwarder_item_cargothai.id;


--
-- Name: tb_tmp_forwarder_item_momo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_tmp_forwarder_item_momo (
    id bigint NOT NULL,
    productid character varying(255) NOT NULL,
    productname character varying(255) NOT NULL,
    producttracking character varying(255) NOT NULL,
    producttrackingnote text NOT NULL,
    productqty integer NOT NULL,
    productbagid bigint NOT NULL,
    productwidth numeric(10,2) NOT NULL,
    productlength numeric(10,2) NOT NULL,
    productheight numeric(10,2) NOT NULL,
    productweightperitem numeric(10,2) NOT NULL,
    productweightall numeric(10,2) NOT NULL,
    productcbmperitem numeric(10,6) NOT NULL,
    productcbmall numeric(10,6) NOT NULL,
    productweightformat character varying(100) NOT NULL,
    producttypecode character varying(5) NOT NULL,
    containercode character varying(200) NOT NULL,
    userid character varying(50) NOT NULL,
    fid bigint NOT NULL,
    date timestamp without time zone,
    lasttimeupdated timestamp without time zone,
    adminid character varying(50) NOT NULL,
    adminidupdated character varying(50) NOT NULL,
    domesticshippingchina numeric(10,2) NOT NULL,
    chinawoodencratefeetype character varying(1) NOT NULL,
    chinawoodencratefee numeric(10,2) NOT NULL,
    otherservicefee numeric(10,2) NOT NULL,
    thailanddeliveryfee numeric(10,2) NOT NULL,
    frefprice character varying(1) NOT NULL,
    fqc character varying(1) NOT NULL,
    fqcprice numeric(10,2) NOT NULL,
    fpriceupdate numeric(10,2) NOT NULL,
    fdiscount numeric(10,2) NOT NULL,
    sm_code character varying(255) NOT NULL,
    sm character varying(255) NOT NULL,
    container_code character varying(255) NOT NULL,
    productcostchn numeric(10,2) NOT NULL,
    transport_code character varying(5) NOT NULL
);


--
-- Name: COLUMN tb_tmp_forwarder_item_momo.adminid; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_tmp_forwarder_item_momo.adminid IS 'แอดมินที่สร้าง';


--
-- Name: COLUMN tb_tmp_forwarder_item_momo.adminidupdated; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_tmp_forwarder_item_momo.adminidupdated IS 'แอดมินที่แก้ไขล่าสุด';


--
-- Name: COLUMN tb_tmp_forwarder_item_momo.domesticshippingchina; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_tmp_forwarder_item_momo.domesticshippingchina IS 'ค่าขนส่งในจีน เดิมใน tb_forwarder fTransportPriceCHNTHB';


--
-- Name: COLUMN tb_tmp_forwarder_item_momo.chinawoodencratefeetype; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_tmp_forwarder_item_momo.chinawoodencratefeetype IS 'ตีลังไม้ 1=ไม่ตี, 2=ตีลัง เดิม tb_forwarder crate';


--
-- Name: COLUMN tb_tmp_forwarder_item_momo.chinawoodencratefee; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_tmp_forwarder_item_momo.chinawoodencratefee IS 'ค่าตีลังไม้';


--
-- Name: COLUMN tb_tmp_forwarder_item_momo.otherservicefee; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_tmp_forwarder_item_momo.otherservicefee IS 'ค่าบริการอื่น ๆ';


--
-- Name: COLUMN tb_tmp_forwarder_item_momo.thailanddeliveryfee; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_tmp_forwarder_item_momo.thailanddeliveryfee IS 'ค่าขนส่งในไทย';


--
-- Name: COLUMN tb_tmp_forwarder_item_momo.frefprice; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_tmp_forwarder_item_momo.frefprice IS 'คิดเรทนำเข้าตาม 1=น้ำหนัก 2=ปริมาตร';


--
-- Name: COLUMN tb_tmp_forwarder_item_momo.fqc; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_tmp_forwarder_item_momo.fqc IS '	1=ไม่ตรวจนับ, 2=ตรวจนับ';


--
-- Name: COLUMN tb_tmp_forwarder_item_momo.fqcprice; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_tmp_forwarder_item_momo.fqcprice IS 'ค่า QC สินค้า';


--
-- Name: COLUMN tb_tmp_forwarder_item_momo.fpriceupdate; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_tmp_forwarder_item_momo.fpriceupdate IS 'ราคาที่เก็บเพิ่มมาจากฝากนำเข้า';


--
-- Name: COLUMN tb_tmp_forwarder_item_momo.fdiscount; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_tmp_forwarder_item_momo.fdiscount IS 'ส่วนลด';


--
-- Name: COLUMN tb_tmp_forwarder_item_momo.productcostchn; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_tmp_forwarder_item_momo.productcostchn IS 'note_amount';


--
-- Name: tb_tmp_forwarder_item_momo_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_tmp_forwarder_item_momo_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_tmp_forwarder_item_momo_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_tmp_forwarder_item_momo_id_seq OWNED BY public.tb_tmp_forwarder_item_momo.id;


--
-- Name: tb_tmp_forwarder_momo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_tmp_forwarder_momo (
    id bigint NOT NULL,
    container_name character varying(255),
    container_code character varying(255),
    due_date timestamp without time zone,
    box_total integer,
    box_weight numeric(10,2),
    box_cbm numeric(10,6),
    sm_code character varying(255),
    sm_date timestamp without time zone,
    manifest_date timestamp without time zone,
    estimated_date timestamp without time zone,
    etd timestamp without time zone,
    eta timestamp without time zone,
    re timestamp without time zone,
    created_at timestamp without time zone,
    note text,
    note_amount integer,
    transport_name character varying(255),
    transport_code character varying(255),
    warehouse_name character varying(255),
    warehouse_code character varying(255),
    status character varying(255),
    status_date timestamp without time zone,
    sm character varying(255),
    userid character varying(255),
    hno character varying(255),
    api_lasttimeupdated timestamp without time zone
);


--
-- Name: COLUMN tb_tmp_forwarder_momo.note_amount; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_tmp_forwarder_momo.note_amount IS 'หน่วยหยวน';


--
-- Name: tb_tmp_forwarder_momo_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_tmp_forwarder_momo_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_tmp_forwarder_momo_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_tmp_forwarder_momo_id_seq OWNED BY public.tb_tmp_forwarder_momo.id;


--
-- Name: tb_tmp_profile_admin; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_tmp_profile_admin (
    id bigint NOT NULL,
    token character varying(70) NOT NULL
);


--
-- Name: tb_tmp_profile_admin_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_tmp_profile_admin_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_tmp_profile_admin_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_tmp_profile_admin_id_seq OWNED BY public.tb_tmp_profile_admin.id;


--
-- Name: tb_user_sales; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_user_sales (
    id bigint NOT NULL,
    usstatus character varying(1) NOT NULL,
    date timestamp without time zone,
    useridmain character varying(10) NOT NULL,
    userid character varying(10) NOT NULL,
    idf bigint NOT NULL
);


--
-- Name: COLUMN tb_user_sales.idf; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_user_sales.idf IS 'เลขที่ออเดอร์นำเข้า';


--
-- Name: tb_user_sales_admin_pay; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_user_sales_admin_pay (
    id bigint NOT NULL,
    date timestamp without time zone,
    status character varying(1) NOT NULL,
    useridmain character varying(10) NOT NULL,
    dateslip timestamp without time zone,
    imagesslip character varying(200) NOT NULL,
    amount numeric(10,2) NOT NULL,
    admincreate character varying(20) NOT NULL,
    name_blank character varying(256) NOT NULL,
    no_blank character varying(256) NOT NULL,
    name_account character varying(256) NOT NULL,
    file character varying(300) NOT NULL
);


--
-- Name: COLUMN tb_user_sales_admin_pay.date; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_user_sales_admin_pay.date IS 'วันที่สร้าง';


--
-- Name: tb_user_sales_admin_pay_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_user_sales_admin_pay_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_user_sales_admin_pay_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_user_sales_admin_pay_id_seq OWNED BY public.tb_user_sales_admin_pay.id;


--
-- Name: tb_user_sales_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_user_sales_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_user_sales_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_user_sales_id_seq OWNED BY public.tb_user_sales.id;


--
-- Name: tb_user_sales_pay; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_user_sales_pay (
    id bigint NOT NULL,
    idus bigint NOT NULL,
    idusap bigint NOT NULL
);


--
-- Name: COLUMN tb_user_sales_pay.idusap; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_user_sales_pay.idusap IS 'ไอดีที่ทำรายการจ่าย';


--
-- Name: tb_user_sales_pay_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_user_sales_pay_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_user_sales_pay_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_user_sales_pay_id_seq OWNED BY public.tb_user_sales_pay.id;


--
-- Name: tb_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_users (
    id bigint NOT NULL,
    userid character varying(10) NOT NULL,
    usertel character varying(13) NOT NULL,
    userstatus character varying(1) DEFAULT '1'::character varying NOT NULL,
    userpass character varying(80) NOT NULL,
    pcs_logged character varying(80),
    username character varying(200) NOT NULL,
    userlastname character varying(200) NOT NULL,
    useremail character varying(100),
    userlineid character varying(50),
    userfacebook character varying(255),
    userregistered timestamp without time zone,
    usersex character varying(10),
    userbirthday date,
    userlastlogin timestamp without time zone,
    userregisterwith character varying(3),
    userpicture character varying(150) DEFAULT 'user.jpg'::character varying NOT NULL,
    userrecoverkey character varying(30),
    userrecoverdate timestamp without time zone,
    coid character varying(10) DEFAULT 'PCS'::character varying NOT NULL,
    adminid character varying(20),
    adminidsale character varying(20),
    userlinenotify character varying(80) NOT NULL,
    usercompany character varying(1) NOT NULL,
    usercomparison character varying(1) NOT NULL,
    usercomparisonvalue numeric(10,2) NOT NULL,
    usercredit character varying(1) NOT NULL,
    usercreditvalue numeric(10,2) NOT NULL,
    usercreditdate integer NOT NULL,
    shopuser character varying(1) NOT NULL,
    channel character varying(2) NOT NULL,
    userrecom character varying(20) NOT NULL,
    useraddressid character varying(20) NOT NULL,
    usertransporttype character varying(1) NOT NULL,
    usershipby character varying(20) NOT NULL,
    userpaymethod character varying(1) NOT NULL,
    usernote text NOT NULL,
    useractive character varying(1) NOT NULL,
    userlineidoa character varying(50) NOT NULL,
    companycustomer character varying(1) NOT NULL
);


--
-- Name: COLUMN tb_users.userid; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_users.userid IS 'รหัสสมาชิก';


--
-- Name: COLUMN tb_users.usertel; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_users.usertel IS 'เบอร์โทร';


--
-- Name: COLUMN tb_users.userstatus; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_users.userstatus IS 'สถานะการใช้งานบัญชี_1=ใช้งาน,0=ลบบัญชี';


--
-- Name: COLUMN tb_users.userpass; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_users.userpass IS 'รหัสผ่านเข้าสู่ระบบ';


--
-- Name: COLUMN tb_users.username; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_users.username IS 'ชื่อจริง';


--
-- Name: COLUMN tb_users.userlastname; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_users.userlastname IS 'นามสกุล';


--
-- Name: COLUMN tb_users.useremail; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_users.useremail IS 'อีเมล';


--
-- Name: COLUMN tb_users.userlineid; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_users.userlineid IS 'ไอดีไลน์';


--
-- Name: COLUMN tb_users.userfacebook; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_users.userfacebook IS 'ลิงก์เฟสบุ๊ก';


--
-- Name: COLUMN tb_users.userregistered; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_users.userregistered IS 'วันที่สมัครใช้งาน';


--
-- Name: COLUMN tb_users.usersex; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_users.usersex IS 'เพศ Null=ไม่ระบุ,1=ชาย,2=หญิง,3=เพศทางเลือก';


--
-- Name: COLUMN tb_users.userbirthday; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_users.userbirthday IS 'วันเกิด';


--
-- Name: COLUMN tb_users.userlastlogin; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_users.userlastlogin IS 'เวลาล็อกอินล่าสุด';


--
-- Name: COLUMN tb_users.userregisterwith; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_users.userregisterwith IS 'วิธีสมัครสมาชิก PCS=สมาชิกในระบบ,F=เฟสบุ๊ก,L=ไลน์';


--
-- Name: COLUMN tb_users.userrecoverkey; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_users.userrecoverkey IS 'ตัวเลขขอรีเซ็ตรหัสผ่าน';


--
-- Name: COLUMN tb_users.userrecoverdate; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_users.userrecoverdate IS 'วันที่ขอรีเซ็ต';


--
-- Name: COLUMN tb_users.coid; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_users.coid IS 'กลุ่มลูกค้า PCS=ลูกค้าทั่วไป';


--
-- Name: COLUMN tb_users.adminid; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_users.adminid IS 'admin ที่สร้างบัญชีนี้';


--
-- Name: COLUMN tb_users.shopuser; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_users.shopuser IS '1=ซื้อไปใข้เอง';


--
-- Name: COLUMN tb_users.userpaymethod; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_users.userpaymethod IS 'วิธีเก็บเงิน 1=ต้นทาง 2=ปลายทาง';


--
-- Name: COLUMN tb_users.useractive; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_users.useractive IS '1=ใช้งานแล้ว';


--
-- Name: COLUMN tb_users.userlineidoa; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_users.userlineidoa IS 'user_line_id';


--
-- Name: COLUMN tb_users.companycustomer; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_users.companycustomer IS '1=seafreight,2=cargo';


--
-- Name: tb_users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_users_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_users_id_seq OWNED BY public.tb_users.id;


--
-- Name: tb_users_otp; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_users_otp (
    id bigint NOT NULL,
    userid character varying(30) NOT NULL,
    date timestamp without time zone
);


--
-- Name: COLUMN tb_users_otp.date; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_users_otp.date IS 'วันที่ยืนยันตัวตน';


--
-- Name: tb_users_otp_hs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_users_otp_hs (
    id bigint NOT NULL,
    date timestamp without time zone,
    userid character varying(30) NOT NULL,
    tel character varying(12) NOT NULL,
    type character varying(1) NOT NULL,
    ip character varying(45) NOT NULL,
    refno character varying(20) NOT NULL,
    token character varying(40) NOT NULL
);


--
-- Name: COLUMN tb_users_otp_hs.type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_users_otp_hs.type IS '1=ยืนยันตัวตนสมัครใหม่,2=ยืนยันตัวตนลูกค้าเดิม,3=ขอรหัสผ่านใหม่,4=เปลี่ยนเบอร์';


--
-- Name: tb_users_otp_hs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_users_otp_hs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_users_otp_hs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_users_otp_hs_id_seq OWNED BY public.tb_users_otp_hs.id;


--
-- Name: tb_users_otp_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_users_otp_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_users_otp_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_users_otp_id_seq OWNED BY public.tb_users_otp.id;


--
-- Name: tb_wallet; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_wallet (
    userid character varying(10) NOT NULL,
    wallettotal numeric(10,2) DEFAULT 0.00
);


--
-- Name: COLUMN tb_wallet.userid; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_wallet.userid IS 'รหัสสมาชิก';


--
-- Name: COLUMN tb_wallet.wallettotal; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_wallet.wallettotal IS 'ยอดเงินกระเป่า';


--
-- Name: tb_wallet_hs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_wallet_hs (
    id bigint NOT NULL,
    date timestamp without time zone,
    dateslip timestamp without time zone,
    amount numeric(10,2) NOT NULL,
    status character varying(1),
    type character varying(1),
    typenew character varying(1) NOT NULL,
    typeservice character varying(1) NOT NULL,
    paydeposit character varying(1),
    admincreate character varying(20),
    imagesslip character varying(150),
    depositnamebank character varying(100),
    nameuserbank character varying(200),
    nouserbank character varying(200),
    note text,
    adminid character varying(20),
    adminidupdate character varying(20),
    lockdate timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    session character varying(100),
    reforder character varying(30),
    reforder2 bigint,
    whno character varying(30) NOT NULL,
    wusercredit character varying(1) NOT NULL,
    userid character varying(20) NOT NULL,
    adminidcrate character varying(30) NOT NULL
);


--
-- Name: COLUMN tb_wallet_hs.date; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_wallet_hs.date IS 'วันที่ทำรายการ';


--
-- Name: COLUMN tb_wallet_hs.dateslip; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_wallet_hs.dateslip IS 'วันที่โอนในสลิป ฝาก';


--
-- Name: COLUMN tb_wallet_hs.amount; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_wallet_hs.amount IS 'จำนวนเงิน';


--
-- Name: COLUMN tb_wallet_hs.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_wallet_hs.status IS '1=รอดำเนินการ,2=สำเร็จ,3=ไม่สำเร็จ';


--
-- Name: COLUMN tb_wallet_hs.type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_wallet_hs.type IS '1=รายการเติมเงิน,2=รายการชำระเงินฝากสั่ง,3=รายการถอนเงิน,4=รายการชำระเงินฝากนำเข้า,5=รายการคืนเงิน,6=ชำระเงินฝากโอน,7=ชำระเงินรอตรวจสอบการเติม';


--
-- Name: COLUMN tb_wallet_hs.typenew; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_wallet_hs.typenew IS '1=เติมเงิน,2=คืนเงิน,3=ชำระฝากสั่ง,4=ชำระฝากสั่งเติมเพิ่ม,5=ชำระนำเข้า,6=ชำระเงินนำเข้าเติมเพิ่ม, 7=ชำระเงินฝากโอน';


--
-- Name: COLUMN tb_wallet_hs.typeservice; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_wallet_hs.typeservice IS '1=ฝากสั่งซื้อ, 2=ฝากนำเข้า, 3=ฝากโอน';


--
-- Name: COLUMN tb_wallet_hs.paydeposit; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_wallet_hs.paydeposit IS 'รายการเติมพร้อมชำระ';


--
-- Name: COLUMN tb_wallet_hs.imagesslip; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_wallet_hs.imagesslip IS 'ชื่อไฟล์สลิป ฝาก หรือ ถอน';


--
-- Name: COLUMN tb_wallet_hs.depositnamebank; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_wallet_hs.depositnamebank IS 'ธนาคารปลายทางที่รับเงิน';


--
-- Name: COLUMN tb_wallet_hs.nameuserbank; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_wallet_hs.nameuserbank IS 'ชื่อบัญชีรับเงินคืน';


--
-- Name: COLUMN tb_wallet_hs.nouserbank; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_wallet_hs.nouserbank IS 'เลขที่บัญชีโอนเงินคืน';


--
-- Name: COLUMN tb_wallet_hs.adminid; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_wallet_hs.adminid IS 'adminเปิดรายการ';


--
-- Name: COLUMN tb_wallet_hs.adminidupdate; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_wallet_hs.adminidupdate IS 'แอดมินทำรายการ';


--
-- Name: COLUMN tb_wallet_hs.lockdate; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_wallet_hs.lockdate IS 'เวลาห้ามเปิดรายการซ้ำ';


--
-- Name: COLUMN tb_wallet_hs.session; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_wallet_hs.session IS 'เครื่องที่มาเปิดตอนนั้น';


--
-- Name: COLUMN tb_wallet_hs.reforder; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_wallet_hs.reforder IS 'อ้างอิงรายการตามสถานะ รายการฝากชำระเงินเลขที่ รายการถอนเงิน';


--
-- Name: COLUMN tb_wallet_hs.reforder2; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_wallet_hs.reforder2 IS 'อ้างอิงการเติมพร้อมชำระ
';


--
-- Name: tb_wallet_hs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_wallet_hs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_wallet_hs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_wallet_hs_id_seq OWNED BY public.tb_wallet_hs.id;


--
-- Name: tb_wallet_paydeposit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_wallet_paydeposit (
    id bigint NOT NULL,
    whid bigint NOT NULL,
    hno character varying(30) NOT NULL
);


--
-- Name: tb_wallet_paydeposit_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_wallet_paydeposit_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_wallet_paydeposit_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_wallet_paydeposit_id_seq OWNED BY public.tb_wallet_paydeposit.id;


--
-- Name: tb_web_hs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_web_hs (
    id bigint NOT NULL,
    datetime timestamp without time zone,
    ip character varying(45) NOT NULL,
    device integer NOT NULL,
    os integer NOT NULL,
    browser integer NOT NULL,
    load_time numeric(10,8) NOT NULL,
    user_agent text NOT NULL,
    session_id character varying(256) NOT NULL,
    userid character varying(30) NOT NULL,
    page_name integer NOT NULL
);


--
-- Name: COLUMN tb_web_hs.device; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_web_hs.device IS 'nameGetDevice()';


--
-- Name: COLUMN tb_web_hs.os; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_web_hs.os IS 'nameGetOS()';


--
-- Name: COLUMN tb_web_hs.browser; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_web_hs.browser IS 'getBrowserName()';


--
-- Name: COLUMN tb_web_hs.page_name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_web_hs.page_name IS 'namePageName()';


--
-- Name: tb_web_hs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_web_hs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_web_hs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_web_hs_id_seq OWNED BY public.tb_web_hs.id;


--
-- Name: tb_withdraw_comm_interpreter_h; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_withdraw_comm_interpreter_h (
    id bigint NOT NULL,
    date timestamp without time zone,
    dateupdate timestamp without time zone,
    title character varying(300) NOT NULL,
    amount numeric(10,2) NOT NULL,
    commbefore numeric(10,2) NOT NULL,
    withholding numeric(10,2) NOT NULL,
    status character varying(1) NOT NULL,
    adminidcreate character varying(30) NOT NULL,
    adminidupdate character varying(30) NOT NULL,
    namebank character varying(2) NOT NULL,
    nameuserbank character varying(200) NOT NULL,
    nouserbank character varying(200) NOT NULL,
    imagesslip character varying(300) NOT NULL,
    adminid character varying(30) NOT NULL
);


--
-- Name: COLUMN tb_withdraw_comm_interpreter_h.commbefore; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_withdraw_comm_interpreter_h.commbefore IS 'Commission before';


--
-- Name: COLUMN tb_withdraw_comm_interpreter_h.withholding; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_withdraw_comm_interpreter_h.withholding IS 'Withholding';


--
-- Name: tb_withdraw_comm_interpreter_h_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_withdraw_comm_interpreter_h_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_withdraw_comm_interpreter_h_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_withdraw_comm_interpreter_h_id_seq OWNED BY public.tb_withdraw_comm_interpreter_h.id;


--
-- Name: tb_withdraw_comm_interpreter_item; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_withdraw_comm_interpreter_item (
    id bigint NOT NULL,
    hno character varying(30) NOT NULL,
    wciid bigint NOT NULL,
    diffyaun numeric(10,2) NOT NULL
);


--
-- Name: COLUMN tb_withdraw_comm_interpreter_item.diffyaun; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_withdraw_comm_interpreter_item.diffyaun IS 'ส่วนต่าง ณ วันที่จ่ายเงิน';


--
-- Name: tb_withdraw_comm_interpreter_item_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_withdraw_comm_interpreter_item_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_withdraw_comm_interpreter_item_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_withdraw_comm_interpreter_item_id_seq OWNED BY public.tb_withdraw_comm_interpreter_item.id;


--
-- Name: tb_withdraw_comm_sale_h; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_withdraw_comm_sale_h (
    id bigint NOT NULL,
    date timestamp without time zone,
    dateupdate timestamp without time zone,
    title character varying(300) NOT NULL,
    amount numeric(10,2) NOT NULL,
    commbefore numeric(10,2) NOT NULL,
    withholding numeric(10,2) NOT NULL,
    status character varying(1) NOT NULL,
    adminidcreate character varying(30) NOT NULL,
    adminidupdate character varying(30) NOT NULL,
    namebank character varying(2) NOT NULL,
    nameuserbank character varying(200) NOT NULL,
    nouserbank character varying(200) NOT NULL,
    imagesslip character varying(300) NOT NULL,
    adminid character varying(30) NOT NULL
);


--
-- Name: COLUMN tb_withdraw_comm_sale_h.commbefore; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_withdraw_comm_sale_h.commbefore IS 'Commission before ';


--
-- Name: COLUMN tb_withdraw_comm_sale_h.withholding; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_withdraw_comm_sale_h.withholding IS 'Withholding';


--
-- Name: tb_withdraw_comm_sale_h_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_withdraw_comm_sale_h_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_withdraw_comm_sale_h_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_withdraw_comm_sale_h_id_seq OWNED BY public.tb_withdraw_comm_sale_h.id;


--
-- Name: tb_withdraw_comm_sale_item; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_withdraw_comm_sale_item (
    id bigint NOT NULL,
    fid bigint NOT NULL,
    wcsid bigint NOT NULL
);


--
-- Name: tb_withdraw_comm_sale_item_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_withdraw_comm_sale_item_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_withdraw_comm_sale_item_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_withdraw_comm_sale_item_id_seq OWNED BY public.tb_withdraw_comm_sale_item.id;


--
-- Name: tb_youtude; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_youtude (
    id bigint NOT NULL,
    dateget timestamp without time zone,
    title text NOT NULL,
    videoid character varying(256) NOT NULL,
    urlcover character varying(256) NOT NULL,
    category character varying(1) NOT NULL
);


--
-- Name: TABLE tb_youtude; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.tb_youtude IS 'ข้อมูลจาก youtude';


--
-- Name: COLUMN tb_youtude.category; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_youtude.category IS '1=all,2=ceo';


--
-- Name: tb_youtude_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_youtude_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_youtude_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_youtude_id_seq OWNED BY public.tb_youtude.id;


--
-- Name: reserve_meeting_room id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reserve_meeting_room ALTER COLUMN id SET DEFAULT nextval('public.reserve_meeting_room_id_seq'::regclass);


--
-- Name: tas_historydata_mobile id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tas_historydata_mobile ALTER COLUMN id SET DEFAULT nextval('public.tas_historydata_mobile_id_seq'::regclass);


--
-- Name: tas_historydataold id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tas_historydataold ALTER COLUMN id SET DEFAULT nextval('public.tas_historydataold_id_seq'::regclass);


--
-- Name: tas_historydataold_tmp id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tas_historydataold_tmp ALTER COLUMN id SET DEFAULT nextval('public.tas_historydataold_tmp_id_seq'::regclass);


--
-- Name: tas_holiday id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tas_holiday ALTER COLUMN id SET DEFAULT nextval('public.tas_holiday_id_seq'::regclass);


--
-- Name: tas_holiday_maid id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tas_holiday_maid ALTER COLUMN id SET DEFAULT nextval('public.tas_holiday_maid_id_seq'::regclass);


--
-- Name: tas_leave id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tas_leave ALTER COLUMN id SET DEFAULT nextval('public.tas_leave_id_seq'::regclass);


--
-- Name: tb_account_pcs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_account_pcs ALTER COLUMN id SET DEFAULT nextval('public.tb_account_pcs_id_seq'::regclass);


--
-- Name: tb_address addressid; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_address ALTER COLUMN addressid SET DEFAULT nextval('public.tb_address_addressid_seq'::regclass);


--
-- Name: tb_address_main id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_address_main ALTER COLUMN id SET DEFAULT nextval('public.tb_address_main_id_seq'::regclass);


--
-- Name: tb_address_maomao_free id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_address_maomao_free ALTER COLUMN id SET DEFAULT nextval('public.tb_address_maomao_free_id_seq'::regclass);


--
-- Name: tb_admin id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_admin ALTER COLUMN id SET DEFAULT nextval('public.tb_admin_id_seq'::regclass);


--
-- Name: tb_admin_address id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_admin_address ALTER COLUMN id SET DEFAULT nextval('public.tb_admin_address_id_seq'::regclass);


--
-- Name: tb_api_china_hs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_api_china_hs ALTER COLUMN id SET DEFAULT nextval('public.tb_api_china_hs_id_seq'::regclass);


--
-- Name: tb_bill billid; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_bill ALTER COLUMN billid SET DEFAULT nextval('public.tb_bill_billid_seq'::regclass);


--
-- Name: tb_bill_item id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_bill_item ALTER COLUMN id SET DEFAULT nextval('public.tb_bill_item_id_seq'::regclass);


--
-- Name: tb_cart id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_cart ALTER COLUMN id SET DEFAULT nextval('public.tb_cart_id_seq'::regclass);


--
-- Name: tb_cash_back_hs cbhid; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_cash_back_hs ALTER COLUMN cbhid SET DEFAULT nextval('public.tb_cash_back_hs_cbhid_seq'::regclass);


--
-- Name: tb_check_forwarder id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_check_forwarder ALTER COLUMN id SET DEFAULT nextval('public.tb_check_forwarder_id_seq'::regclass);


--
-- Name: tb_cnt id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_cnt ALTER COLUMN id SET DEFAULT nextval('public.tb_cnt_id_seq'::regclass);


--
-- Name: tb_cnt_item id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_cnt_item ALTER COLUMN id SET DEFAULT nextval('public.tb_cnt_item_id_seq'::regclass);


--
-- Name: tb_cnt_pay_idorco id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_cnt_pay_idorco ALTER COLUMN id SET DEFAULT nextval('public.tb_cnt_pay_idorco_id_seq'::regclass);


--
-- Name: tb_cnt_pay_trackingchn id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_cnt_pay_trackingchn ALTER COLUMN id SET DEFAULT nextval('public.tb_cnt_pay_trackingchn_id_seq'::regclass);


--
-- Name: tb_co id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_co ALTER COLUMN id SET DEFAULT nextval('public.tb_co_id_seq'::regclass);


--
-- Name: tb_contact_outsider id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_contact_outsider ALTER COLUMN id SET DEFAULT nextval('public.tb_contact_outsider_id_seq'::regclass);


--
-- Name: tb_corporate id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_corporate ALTER COLUMN id SET DEFAULT nextval('public.tb_corporate_id_seq'::regclass);


--
-- Name: tb_cost_container id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_cost_container ALTER COLUMN id SET DEFAULT nextval('public.tb_cost_container_id_seq'::regclass);


--
-- Name: tb_customrate_hs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_customrate_hs ALTER COLUMN id SET DEFAULT nextval('public.tb_customrate_hs_id_seq'::regclass);


--
-- Name: tb_education_background id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_education_background ALTER COLUMN id SET DEFAULT nextval('public.tb_education_background_id_seq'::regclass);


--
-- Name: tb_farwarder_quotation id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_farwarder_quotation ALTER COLUMN id SET DEFAULT nextval('public.tb_farwarder_quotation_id_seq'::regclass);


--
-- Name: tb_farwarder_quotation_item id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_farwarder_quotation_item ALTER COLUMN id SET DEFAULT nextval('public.tb_farwarder_quotation_item_id_seq'::regclass);


--
-- Name: tb_forwarder id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_forwarder ALTER COLUMN id SET DEFAULT nextval('public.tb_forwarder_id_seq'::regclass);


--
-- Name: tb_forwarder_driver id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_forwarder_driver ALTER COLUMN id SET DEFAULT nextval('public.tb_forwarder_driver_id_seq'::regclass);


--
-- Name: tb_forwarder_driver_item id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_forwarder_driver_item ALTER COLUMN id SET DEFAULT nextval('public.tb_forwarder_driver_item_id_seq'::regclass);


--
-- Name: tb_forwarder_img id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_forwarder_img ALTER COLUMN id SET DEFAULT nextval('public.tb_forwarder_img_id_seq'::regclass);


--
-- Name: tb_forwarder_import id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_forwarder_import ALTER COLUMN id SET DEFAULT nextval('public.tb_forwarder_import_id_seq'::regclass);


--
-- Name: tb_forwarder_import2 id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_forwarder_import2 ALTER COLUMN id SET DEFAULT nextval('public.tb_forwarder_import2_id_seq'::regclass);


--
-- Name: tb_forwarder_item id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_forwarder_item ALTER COLUMN id SET DEFAULT nextval('public.tb_forwarder_item_id_seq'::regclass);


--
-- Name: tb_forwarder_jmf_tmp id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_forwarder_jmf_tmp ALTER COLUMN id SET DEFAULT nextval('public.tb_forwarder_jmf_tmp_id_seq'::regclass);


--
-- Name: tb_forwarder_prepare id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_forwarder_prepare ALTER COLUMN id SET DEFAULT nextval('public.tb_forwarder_prepare_id_seq'::regclass);


--
-- Name: tb_forwarder_tran_th_h id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_forwarder_tran_th_h ALTER COLUMN id SET DEFAULT nextval('public.tb_forwarder_tran_th_h_id_seq'::regclass);


--
-- Name: tb_forwarder_tran_th_sub id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_forwarder_tran_th_sub ALTER COLUMN id SET DEFAULT nextval('public.tb_forwarder_tran_th_sub_id_seq'::regclass);


--
-- Name: tb_header_order id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_header_order ALTER COLUMN id SET DEFAULT nextval('public.tb_header_order_id_seq'::regclass);


--
-- Name: tb_history id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_history ALTER COLUMN id SET DEFAULT nextval('public.tb_history_id_seq'::regclass);


--
-- Name: tb_history_key id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_history_key ALTER COLUMN id SET DEFAULT nextval('public.tb_history_key_id_seq'::regclass);


--
-- Name: tb_hs_rate_custom_cbm id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_hs_rate_custom_cbm ALTER COLUMN id SET DEFAULT nextval('public.tb_hs_rate_custom_cbm_id_seq'::regclass);


--
-- Name: tb_hs_rate_custom_kg id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_hs_rate_custom_kg ALTER COLUMN id SET DEFAULT nextval('public.tb_hs_rate_custom_kg_id_seq'::regclass);


--
-- Name: tb_keyword_product id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_keyword_product ALTER COLUMN id SET DEFAULT nextval('public.tb_keyword_product_id_seq'::regclass);


--
-- Name: tb_log_forwarder_status id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_log_forwarder_status ALTER COLUMN id SET DEFAULT nextval('public.tb_log_forwarder_status_id_seq'::regclass);


--
-- Name: tb_notify id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_notify ALTER COLUMN id SET DEFAULT nextval('public.tb_notify_id_seq'::regclass);


--
-- Name: tb_notify_read id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_notify_read ALTER COLUMN id SET DEFAULT nextval('public.tb_notify_read_id_seq'::regclass);


--
-- Name: tb_notify_sheet_ctt id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_notify_sheet_ctt ALTER COLUMN id SET DEFAULT nextval('public.tb_notify_sheet_ctt_id_seq'::regclass);


--
-- Name: tb_notify_wp id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_notify_wp ALTER COLUMN id SET DEFAULT nextval('public.tb_notify_wp_id_seq'::regclass);


--
-- Name: tb_options option_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_options ALTER COLUMN option_id SET DEFAULT nextval('public.tb_options_option_id_seq'::regclass);


--
-- Name: tb_order id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_order ALTER COLUMN id SET DEFAULT nextval('public.tb_order_id_seq'::regclass);


--
-- Name: tb_org_email_ships id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_org_email_ships ALTER COLUMN id SET DEFAULT nextval('public.tb_org_email_ships_id_seq'::regclass);


--
-- Name: tb_org_line_ships id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_org_line_ships ALTER COLUMN id SET DEFAULT nextval('public.tb_org_line_ships_id_seq'::regclass);


--
-- Name: tb_org_tell_ships id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_org_tell_ships ALTER COLUMN id SET DEFAULT nextval('public.tb_org_tell_ships_id_seq'::regclass);


--
-- Name: tb_org_wechat_ships id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_org_wechat_ships ALTER COLUMN id SET DEFAULT nextval('public.tb_org_wechat_ships_id_seq'::regclass);


--
-- Name: tb_organization_domainname id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_organization_domainname ALTER COLUMN id SET DEFAULT nextval('public.tb_organization_domainname_id_seq'::regclass);


--
-- Name: tb_organization_email id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_organization_email ALTER COLUMN id SET DEFAULT nextval('public.tb_organization_email_id_seq'::regclass);


--
-- Name: tb_organization_line id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_organization_line ALTER COLUMN id SET DEFAULT nextval('public.tb_organization_line_id_seq'::regclass);


--
-- Name: tb_organization_tell id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_organization_tell ALTER COLUMN id SET DEFAULT nextval('public.tb_organization_tell_id_seq'::regclass);


--
-- Name: tb_organization_wechat id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_organization_wechat ALTER COLUMN id SET DEFAULT nextval('public.tb_organization_wechat_id_seq'::regclass);


--
-- Name: tb_otp_check id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_otp_check ALTER COLUMN id SET DEFAULT nextval('public.tb_otp_check_id_seq'::regclass);


--
-- Name: tb_page_name id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_page_name ALTER COLUMN id SET DEFAULT nextval('public.tb_page_name_id_seq'::regclass);


--
-- Name: tb_payment id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_payment ALTER COLUMN id SET DEFAULT nextval('public.tb_payment_id_seq'::regclass);


--
-- Name: tb_pcs_logged id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_pcs_logged ALTER COLUMN id SET DEFAULT nextval('public.tb_pcs_logged_id_seq'::regclass);


--
-- Name: tb_post_job id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_post_job ALTER COLUMN id SET DEFAULT nextval('public.tb_post_job_id_seq'::regclass);


--
-- Name: tb_product id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_product ALTER COLUMN id SET DEFAULT nextval('public.tb_product_id_seq'::regclass);


--
-- Name: tb_product_category pcid; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_product_category ALTER COLUMN pcid SET DEFAULT nextval('public.tb_product_category_pcid_seq'::regclass);


--
-- Name: tb_promotion id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_promotion ALTER COLUMN id SET DEFAULT nextval('public.tb_promotion_id_seq'::regclass);


--
-- Name: tb_rate_custom_cbm id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_rate_custom_cbm ALTER COLUMN id SET DEFAULT nextval('public.tb_rate_custom_cbm_id_seq'::regclass);


--
-- Name: tb_rate_custom_kg id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_rate_custom_kg ALTER COLUMN id SET DEFAULT nextval('public.tb_rate_custom_kg_id_seq'::regclass);


--
-- Name: tb_rate_g_cbm id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_rate_g_cbm ALTER COLUMN id SET DEFAULT nextval('public.tb_rate_g_cbm_id_seq'::regclass);


--
-- Name: tb_rate_g_kg id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_rate_g_kg ALTER COLUMN id SET DEFAULT nextval('public.tb_rate_g_kg_id_seq'::regclass);


--
-- Name: tb_rate_vip_cbm id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_rate_vip_cbm ALTER COLUMN id SET DEFAULT nextval('public.tb_rate_vip_cbm_id_seq'::regclass);


--
-- Name: tb_rate_vip_kg id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_rate_vip_kg ALTER COLUMN id SET DEFAULT nextval('public.tb_rate_vip_kg_id_seq'::regclass);


--
-- Name: tb_receipt id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_receipt ALTER COLUMN id SET DEFAULT nextval('public.tb_receipt_id_seq'::regclass);


--
-- Name: tb_receipt_item id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_receipt_item ALTER COLUMN id SET DEFAULT nextval('public.tb_receipt_item_id_seq'::regclass);


--
-- Name: tb_register id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_register ALTER COLUMN id SET DEFAULT nextval('public.tb_register_id_seq'::regclass);


--
-- Name: tb_sales_report id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_sales_report ALTER COLUMN id SET DEFAULT nextval('public.tb_sales_report_id_seq'::regclass);


--
-- Name: tb_set_comm_interpreter id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_set_comm_interpreter ALTER COLUMN id SET DEFAULT nextval('public.tb_set_comm_interpreter_id_seq'::regclass);


--
-- Name: tb_settings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_settings ALTER COLUMN id SET DEFAULT nextval('public.tb_settings_id_seq'::regclass);


--
-- Name: tb_shop_pay_h id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_shop_pay_h ALTER COLUMN id SET DEFAULT nextval('public.tb_shop_pay_h_id_seq'::regclass);


--
-- Name: tb_shop_pay_sub id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_shop_pay_sub ALTER COLUMN id SET DEFAULT nextval('public.tb_shop_pay_sub_id_seq'::regclass);


--
-- Name: tb_sms_hs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_sms_hs ALTER COLUMN id SET DEFAULT nextval('public.tb_sms_hs_id_seq'::regclass);


--
-- Name: tb_sms_statistic id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_sms_statistic ALTER COLUMN id SET DEFAULT nextval('public.tb_sms_statistic_id_seq'::regclass);


--
-- Name: tb_sms_statistic9 id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_sms_statistic9 ALTER COLUMN id SET DEFAULT nextval('public.tb_sms_statistic9_id_seq'::regclass);


--
-- Name: tb_survey id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_survey ALTER COLUMN id SET DEFAULT nextval('public.tb_survey_id_seq'::regclass);


--
-- Name: tb_survey202306 id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_survey202306 ALTER COLUMN id SET DEFAULT nextval('public.tb_survey202306_id_seq'::regclass);


--
-- Name: tb_terms_service id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_terms_service ALTER COLUMN id SET DEFAULT nextval('public.tb_terms_service_id_seq'::regclass);


--
-- Name: tb_tmp_forwarder_cargothai id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_tmp_forwarder_cargothai ALTER COLUMN id SET DEFAULT nextval('public.tb_tmp_forwarder_cargothai_id_seq'::regclass);


--
-- Name: tb_tmp_forwarder_item_cargothai id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_tmp_forwarder_item_cargothai ALTER COLUMN id SET DEFAULT nextval('public.tb_tmp_forwarder_item_cargothai_id_seq'::regclass);


--
-- Name: tb_tmp_forwarder_item_momo id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_tmp_forwarder_item_momo ALTER COLUMN id SET DEFAULT nextval('public.tb_tmp_forwarder_item_momo_id_seq'::regclass);


--
-- Name: tb_tmp_forwarder_momo id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_tmp_forwarder_momo ALTER COLUMN id SET DEFAULT nextval('public.tb_tmp_forwarder_momo_id_seq'::regclass);


--
-- Name: tb_tmp_profile_admin id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_tmp_profile_admin ALTER COLUMN id SET DEFAULT nextval('public.tb_tmp_profile_admin_id_seq'::regclass);


--
-- Name: tb_user_sales id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_user_sales ALTER COLUMN id SET DEFAULT nextval('public.tb_user_sales_id_seq'::regclass);


--
-- Name: tb_user_sales_admin_pay id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_user_sales_admin_pay ALTER COLUMN id SET DEFAULT nextval('public.tb_user_sales_admin_pay_id_seq'::regclass);


--
-- Name: tb_user_sales_pay id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_user_sales_pay ALTER COLUMN id SET DEFAULT nextval('public.tb_user_sales_pay_id_seq'::regclass);


--
-- Name: tb_users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_users ALTER COLUMN id SET DEFAULT nextval('public.tb_users_id_seq'::regclass);


--
-- Name: tb_users_otp id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_users_otp ALTER COLUMN id SET DEFAULT nextval('public.tb_users_otp_id_seq'::regclass);


--
-- Name: tb_users_otp_hs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_users_otp_hs ALTER COLUMN id SET DEFAULT nextval('public.tb_users_otp_hs_id_seq'::regclass);


--
-- Name: tb_wallet_hs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_wallet_hs ALTER COLUMN id SET DEFAULT nextval('public.tb_wallet_hs_id_seq'::regclass);


--
-- Name: tb_wallet_paydeposit id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_wallet_paydeposit ALTER COLUMN id SET DEFAULT nextval('public.tb_wallet_paydeposit_id_seq'::regclass);


--
-- Name: tb_web_hs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_web_hs ALTER COLUMN id SET DEFAULT nextval('public.tb_web_hs_id_seq'::regclass);


--
-- Name: tb_withdraw_comm_interpreter_h id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_withdraw_comm_interpreter_h ALTER COLUMN id SET DEFAULT nextval('public.tb_withdraw_comm_interpreter_h_id_seq'::regclass);


--
-- Name: tb_withdraw_comm_interpreter_item id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_withdraw_comm_interpreter_item ALTER COLUMN id SET DEFAULT nextval('public.tb_withdraw_comm_interpreter_item_id_seq'::regclass);


--
-- Name: tb_withdraw_comm_sale_h id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_withdraw_comm_sale_h ALTER COLUMN id SET DEFAULT nextval('public.tb_withdraw_comm_sale_h_id_seq'::regclass);


--
-- Name: tb_withdraw_comm_sale_item id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_withdraw_comm_sale_item ALTER COLUMN id SET DEFAULT nextval('public.tb_withdraw_comm_sale_item_id_seq'::regclass);


--
-- Name: tb_youtude id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_youtude ALTER COLUMN id SET DEFAULT nextval('public.tb_youtude_id_seq'::regclass);


--
--


-- ── PRIMARY KEY constraints (117) ────────────────────────────

-- Name: reserve_meeting_room idx_16391_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reserve_meeting_room
    ADD CONSTRAINT idx_16391_primary PRIMARY KEY (id);



--
-- Name: tas_historydata_mobile idx_16398_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tas_historydata_mobile
    ADD CONSTRAINT idx_16398_primary PRIMARY KEY (id);



--
-- Name: tas_historydataold idx_16405_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tas_historydataold
    ADD CONSTRAINT idx_16405_primary PRIMARY KEY (id);



--
-- Name: tas_historydataold_tmp idx_16412_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tas_historydataold_tmp
    ADD CONSTRAINT idx_16412_primary PRIMARY KEY (id);



--
-- Name: tas_holiday idx_16419_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tas_holiday
    ADD CONSTRAINT idx_16419_primary PRIMARY KEY (id);



--
-- Name: tas_holiday_maid idx_16426_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tas_holiday_maid
    ADD CONSTRAINT idx_16426_primary PRIMARY KEY (id);



--
-- Name: tas_leave idx_16433_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tas_leave
    ADD CONSTRAINT idx_16433_primary PRIMARY KEY (id);



--
-- Name: tb_account_pcs idx_16440_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_account_pcs
    ADD CONSTRAINT idx_16440_primary PRIMARY KEY (id);



--
-- Name: tb_address idx_16447_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_address
    ADD CONSTRAINT idx_16447_primary PRIMARY KEY (addressid);



--
-- Name: tb_address_main idx_16455_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_address_main
    ADD CONSTRAINT idx_16455_primary PRIMARY KEY (id);



--
-- Name: tb_address_maomao_free idx_16460_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_address_maomao_free
    ADD CONSTRAINT idx_16460_primary PRIMARY KEY (id);



--
-- Name: tb_admin idx_16467_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_admin
    ADD CONSTRAINT idx_16467_primary PRIMARY KEY (id);



--
-- Name: tb_admin_address idx_16476_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_admin_address
    ADD CONSTRAINT idx_16476_primary PRIMARY KEY (id);



--
-- Name: tb_api_china_hs idx_16483_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_api_china_hs
    ADD CONSTRAINT idx_16483_primary PRIMARY KEY (id);



--
-- Name: tb_bill idx_16490_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_bill
    ADD CONSTRAINT idx_16490_primary PRIMARY KEY (billid);



--
-- Name: tb_bill_item idx_16495_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_bill_item
    ADD CONSTRAINT idx_16495_primary PRIMARY KEY (id);



--
-- Name: tb_cart idx_16500_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_cart
    ADD CONSTRAINT idx_16500_primary PRIMARY KEY (id);



--
-- Name: tb_cash_back idx_16508_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_cash_back
    ADD CONSTRAINT idx_16508_primary PRIMARY KEY (userid);



--
-- Name: tb_cash_back_hs idx_16512_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_cash_back_hs
    ADD CONSTRAINT idx_16512_primary PRIMARY KEY (cbhid);



--
-- Name: tb_check_forwarder idx_16519_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_check_forwarder
    ADD CONSTRAINT idx_16519_primary PRIMARY KEY (id);



--
-- Name: tb_cnt idx_16524_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_cnt
    ADD CONSTRAINT idx_16524_primary PRIMARY KEY (id);



--
-- Name: tb_cnt_item idx_16531_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_cnt_item
    ADD CONSTRAINT idx_16531_primary PRIMARY KEY (id);



--
-- Name: tb_cnt_pay_idorco idx_16536_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_cnt_pay_idorco
    ADD CONSTRAINT idx_16536_primary PRIMARY KEY (id);



--
-- Name: tb_cnt_pay_trackingchn idx_16541_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_cnt_pay_trackingchn
    ADD CONSTRAINT idx_16541_primary PRIMARY KEY (id);



--
-- Name: tb_co idx_16546_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_co
    ADD CONSTRAINT idx_16546_primary PRIMARY KEY (id);



--
-- Name: tb_contact_outsider idx_16552_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_contact_outsider
    ADD CONSTRAINT idx_16552_primary PRIMARY KEY (id);



--
-- Name: tb_corporate idx_16559_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_corporate
    ADD CONSTRAINT idx_16559_primary PRIMARY KEY (id);



--
-- Name: tb_cost_container idx_16567_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_cost_container
    ADD CONSTRAINT idx_16567_primary PRIMARY KEY (id);



--
-- Name: tb_credit idx_16571_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_credit
    ADD CONSTRAINT idx_16571_primary PRIMARY KEY (userid);



--
-- Name: tb_csvimport idx_16574_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_csvimport
    ADD CONSTRAINT idx_16574_primary PRIMARY KEY (id);



--
-- Name: tb_customrate_hs idx_16578_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_customrate_hs
    ADD CONSTRAINT idx_16578_primary PRIMARY KEY (id);



--
-- Name: tb_education_background idx_16583_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_education_background
    ADD CONSTRAINT idx_16583_primary PRIMARY KEY (id);



--
-- Name: tb_farwarder_quotation idx_16590_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_farwarder_quotation
    ADD CONSTRAINT idx_16590_primary PRIMARY KEY (id);



--
-- Name: tb_farwarder_quotation_item idx_16597_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_farwarder_quotation_item
    ADD CONSTRAINT idx_16597_primary PRIMARY KEY (id);



--
-- Name: tb_forwarder idx_16602_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_forwarder
    ADD CONSTRAINT idx_16602_primary PRIMARY KEY (id);



--
-- Name: tb_forwarder_driver idx_16619_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_forwarder_driver
    ADD CONSTRAINT idx_16619_primary PRIMARY KEY (id);



--
-- Name: tb_forwarder_driver_item idx_16624_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_forwarder_driver_item
    ADD CONSTRAINT idx_16624_primary PRIMARY KEY (id);



--
-- Name: tb_forwarder_img idx_16629_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_forwarder_img
    ADD CONSTRAINT idx_16629_primary PRIMARY KEY (id);



--
-- Name: tb_forwarder_import idx_16634_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_forwarder_import
    ADD CONSTRAINT idx_16634_primary PRIMARY KEY (id);



--
-- Name: tb_forwarder_import2 idx_16639_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_forwarder_import2
    ADD CONSTRAINT idx_16639_primary PRIMARY KEY (id);



--
-- Name: tb_forwarder_item idx_16644_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_forwarder_item
    ADD CONSTRAINT idx_16644_primary PRIMARY KEY (id);



--
-- Name: tb_forwarder_jmf_tmp idx_16651_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_forwarder_jmf_tmp
    ADD CONSTRAINT idx_16651_primary PRIMARY KEY (id);



--
-- Name: tb_forwarder_prepare idx_16658_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_forwarder_prepare
    ADD CONSTRAINT idx_16658_primary PRIMARY KEY (id);



--
-- Name: tb_forwarder_tran_th_h idx_16663_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_forwarder_tran_th_h
    ADD CONSTRAINT idx_16663_primary PRIMARY KEY (id);



--
-- Name: tb_forwarder_tran_th_sub idx_16668_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_forwarder_tran_th_sub
    ADD CONSTRAINT idx_16668_primary PRIMARY KEY (id);



--
-- Name: tb_header_order idx_16673_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_header_order
    ADD CONSTRAINT idx_16673_primary PRIMARY KEY (id);



--
-- Name: tb_history idx_16685_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_history
    ADD CONSTRAINT idx_16685_primary PRIMARY KEY (id);



--
-- Name: tb_history_key idx_16692_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_history_key
    ADD CONSTRAINT idx_16692_primary PRIMARY KEY (id);



--
-- Name: tb_hs_rate_custom_cbm idx_16699_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_hs_rate_custom_cbm
    ADD CONSTRAINT idx_16699_primary PRIMARY KEY (id);



--
-- Name: tb_hs_rate_custom_kg idx_16704_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_hs_rate_custom_kg
    ADD CONSTRAINT idx_16704_primary PRIMARY KEY (id);



--
-- Name: tb_keyword_product idx_16709_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_keyword_product
    ADD CONSTRAINT idx_16709_primary PRIMARY KEY (id);



--
-- Name: tb_log_forwarder_status idx_16716_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_log_forwarder_status
    ADD CONSTRAINT idx_16716_primary PRIMARY KEY (id);



--
-- Name: tb_notify idx_16721_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_notify
    ADD CONSTRAINT idx_16721_primary PRIMARY KEY (id);



--
-- Name: tb_notify_read idx_16728_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_notify_read
    ADD CONSTRAINT idx_16728_primary PRIMARY KEY (id);



--
-- Name: tb_notify_sheet_ctt idx_16733_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_notify_sheet_ctt
    ADD CONSTRAINT idx_16733_primary PRIMARY KEY (id);



--
-- Name: tb_notify_wp idx_16738_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_notify_wp
    ADD CONSTRAINT idx_16738_primary PRIMARY KEY (id);



--
-- Name: tb_options idx_16745_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_options
    ADD CONSTRAINT idx_16745_primary PRIMARY KEY (option_id);



--
-- Name: tb_order idx_16752_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_order
    ADD CONSTRAINT idx_16752_primary PRIMARY KEY (id);



--
-- Name: tb_org_email_ships idx_16762_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_org_email_ships
    ADD CONSTRAINT idx_16762_primary PRIMARY KEY (id);



--
-- Name: tb_org_line_ships idx_16767_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_org_line_ships
    ADD CONSTRAINT idx_16767_primary PRIMARY KEY (id);



--
-- Name: tb_org_tell_ships idx_16772_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_org_tell_ships
    ADD CONSTRAINT idx_16772_primary PRIMARY KEY (id);



--
-- Name: tb_org_wechat_ships idx_16777_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_org_wechat_ships
    ADD CONSTRAINT idx_16777_primary PRIMARY KEY (id);



--
-- Name: tb_organization_domainname idx_16782_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_organization_domainname
    ADD CONSTRAINT idx_16782_primary PRIMARY KEY (id);



--
-- Name: tb_organization_email idx_16789_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_organization_email
    ADD CONSTRAINT idx_16789_primary PRIMARY KEY (id);



--
-- Name: tb_organization_line idx_16796_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_organization_line
    ADD CONSTRAINT idx_16796_primary PRIMARY KEY (id);



--
-- Name: tb_organization_tell idx_16803_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_organization_tell
    ADD CONSTRAINT idx_16803_primary PRIMARY KEY (id);



--
-- Name: tb_organization_wechat idx_16810_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_organization_wechat
    ADD CONSTRAINT idx_16810_primary PRIMARY KEY (id);



--
-- Name: tb_otp_check idx_16817_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_otp_check
    ADD CONSTRAINT idx_16817_primary PRIMARY KEY (id);



--
-- Name: tb_page_name idx_16822_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_page_name
    ADD CONSTRAINT idx_16822_primary PRIMARY KEY (id);



--
-- Name: tb_payment idx_16827_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_payment
    ADD CONSTRAINT idx_16827_primary PRIMARY KEY (id);



--
-- Name: tb_pcs_logged idx_16835_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_pcs_logged
    ADD CONSTRAINT idx_16835_primary PRIMARY KEY (id);



--
-- Name: tb_post_job idx_16842_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_post_job
    ADD CONSTRAINT idx_16842_primary PRIMARY KEY (id);



--
-- Name: tb_pro_valentine idx_16848_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_pro_valentine
    ADD CONSTRAINT idx_16848_primary PRIMARY KEY (userid);



--
-- Name: tb_product idx_16854_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_product
    ADD CONSTRAINT idx_16854_primary PRIMARY KEY (id);



--
-- Name: tb_product_category idx_16861_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_product_category
    ADD CONSTRAINT idx_16861_primary PRIMARY KEY (pcid);



--
-- Name: tb_promotion idx_16868_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_promotion
    ADD CONSTRAINT idx_16868_primary PRIMARY KEY (id);



--
-- Name: tb_promotion33 idx_16872_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_promotion33
    ADD CONSTRAINT idx_16872_primary PRIMARY KEY (userid);



--
-- Name: tb_rate_custom_cbm idx_16876_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_rate_custom_cbm
    ADD CONSTRAINT idx_16876_primary PRIMARY KEY (id);



--
-- Name: tb_rate_custom_kg idx_16881_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_rate_custom_kg
    ADD CONSTRAINT idx_16881_primary PRIMARY KEY (id);



--
-- Name: tb_rate_g_cbm idx_16886_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_rate_g_cbm
    ADD CONSTRAINT idx_16886_primary PRIMARY KEY (id);



--
-- Name: tb_rate_g_kg idx_16891_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_rate_g_kg
    ADD CONSTRAINT idx_16891_primary PRIMARY KEY (id);



--
-- Name: tb_rate_vip_cbm idx_16896_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_rate_vip_cbm
    ADD CONSTRAINT idx_16896_primary PRIMARY KEY (id);



--
-- Name: tb_rate_vip_kg idx_16901_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_rate_vip_kg
    ADD CONSTRAINT idx_16901_primary PRIMARY KEY (id);



--
-- Name: tb_receipt idx_16906_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_receipt
    ADD CONSTRAINT idx_16906_primary PRIMARY KEY (id);



--
-- Name: tb_receipt_item idx_16914_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_receipt_item
    ADD CONSTRAINT idx_16914_primary PRIMARY KEY (id);



--
-- Name: tb_register idx_16919_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_register
    ADD CONSTRAINT idx_16919_primary PRIMARY KEY (id);



--
-- Name: tb_sales_report idx_16928_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_sales_report
    ADD CONSTRAINT idx_16928_primary PRIMARY KEY (id);



--
-- Name: tb_set_comm_interpreter idx_16933_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_set_comm_interpreter
    ADD CONSTRAINT idx_16933_primary PRIMARY KEY (id);



--
-- Name: tb_settings idx_16938_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_settings
    ADD CONSTRAINT idx_16938_primary PRIMARY KEY (id);



--
-- Name: tb_shop_pay_h idx_16949_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_shop_pay_h
    ADD CONSTRAINT idx_16949_primary PRIMARY KEY (id);



--
-- Name: tb_shop_pay_sub idx_16956_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_shop_pay_sub
    ADD CONSTRAINT idx_16956_primary PRIMARY KEY (id);



--
-- Name: tb_sms_hs idx_16961_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_sms_hs
    ADD CONSTRAINT idx_16961_primary PRIMARY KEY (id);



--
-- Name: tb_sms_statistic idx_16968_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_sms_statistic
    ADD CONSTRAINT idx_16968_primary PRIMARY KEY (id);



--
-- Name: tb_sms_statistic9 idx_16973_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_sms_statistic9
    ADD CONSTRAINT idx_16973_primary PRIMARY KEY (id);



--
-- Name: tb_survey idx_16978_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_survey
    ADD CONSTRAINT idx_16978_primary PRIMARY KEY (id);



--
-- Name: tb_survey202306 idx_16985_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_survey202306
    ADD CONSTRAINT idx_16985_primary PRIMARY KEY (id);



--
-- Name: tb_terms_service idx_16992_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_terms_service
    ADD CONSTRAINT idx_16992_primary PRIMARY KEY (id);



--
-- Name: tb_tmp_forwarder_cargothai idx_16997_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_tmp_forwarder_cargothai
    ADD CONSTRAINT idx_16997_primary PRIMARY KEY (id);



--
-- Name: tb_tmp_forwarder_item_cargothai idx_17004_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_tmp_forwarder_item_cargothai
    ADD CONSTRAINT idx_17004_primary PRIMARY KEY (id);



--
-- Name: tb_tmp_forwarder_item_momo idx_17011_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_tmp_forwarder_item_momo
    ADD CONSTRAINT idx_17011_primary PRIMARY KEY (id);



--
-- Name: tb_tmp_forwarder_momo idx_17018_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_tmp_forwarder_momo
    ADD CONSTRAINT idx_17018_primary PRIMARY KEY (id);



--
-- Name: tb_tmp_profile_admin idx_17025_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_tmp_profile_admin
    ADD CONSTRAINT idx_17025_primary PRIMARY KEY (id);



--
-- Name: tb_user_sales idx_17030_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_user_sales
    ADD CONSTRAINT idx_17030_primary PRIMARY KEY (id);



--
-- Name: tb_user_sales_admin_pay idx_17035_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_user_sales_admin_pay
    ADD CONSTRAINT idx_17035_primary PRIMARY KEY (id);



--
-- Name: tb_user_sales_pay idx_17042_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_user_sales_pay
    ADD CONSTRAINT idx_17042_primary PRIMARY KEY (id);



--
-- Name: tb_users idx_17047_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_users
    ADD CONSTRAINT idx_17047_primary PRIMARY KEY (id);



--
-- Name: tb_users_otp idx_17057_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_users_otp
    ADD CONSTRAINT idx_17057_primary PRIMARY KEY (id);



--
-- Name: tb_users_otp_hs idx_17062_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_users_otp_hs
    ADD CONSTRAINT idx_17062_primary PRIMARY KEY (id);



--
-- Name: tb_wallet idx_17066_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_wallet
    ADD CONSTRAINT idx_17066_primary PRIMARY KEY (userid);



--
-- Name: tb_wallet_hs idx_17071_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_wallet_hs
    ADD CONSTRAINT idx_17071_primary PRIMARY KEY (id);



--
-- Name: tb_wallet_paydeposit idx_17079_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_wallet_paydeposit
    ADD CONSTRAINT idx_17079_primary PRIMARY KEY (id);



--
-- Name: tb_web_hs idx_17084_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_web_hs
    ADD CONSTRAINT idx_17084_primary PRIMARY KEY (id);



--
-- Name: tb_withdraw_comm_interpreter_h idx_17091_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_withdraw_comm_interpreter_h
    ADD CONSTRAINT idx_17091_primary PRIMARY KEY (id);



--
-- Name: tb_withdraw_comm_interpreter_item idx_17098_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_withdraw_comm_interpreter_item
    ADD CONSTRAINT idx_17098_primary PRIMARY KEY (id);



--
-- Name: tb_withdraw_comm_sale_h idx_17103_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_withdraw_comm_sale_h
    ADD CONSTRAINT idx_17103_primary PRIMARY KEY (id);



--
-- Name: tb_withdraw_comm_sale_item idx_17110_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_withdraw_comm_sale_item
    ADD CONSTRAINT idx_17110_primary PRIMARY KEY (id);



--
-- Name: tb_youtude idx_17115_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_youtude
    ADD CONSTRAINT idx_17115_primary PRIMARY KEY (id);

-- ── Row-Level Security — enable on all 117 tables ───────────
-- No policies: locks each table to service_role. Phase B adds policies.

ALTER TABLE public.reserve_meeting_room ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tas_historydata_mobile ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tas_historydataold ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tas_historydataold_tmp ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tas_holiday ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tas_holiday_maid ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tas_leave ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_account_pcs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_address ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_address_main ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_address_maomao_free ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_admin ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_admin_address ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_api_china_hs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_bill ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_bill_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_cart ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_cash_back ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_cash_back_hs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_check_forwarder ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_cnt ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_cnt_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_cnt_pay_idorco ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_cnt_pay_trackingchn ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_co ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_contact_outsider ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_corporate ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_cost_container ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_credit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_csvimport ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_customrate_hs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_education_background ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_farwarder_quotation ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_farwarder_quotation_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_forwarder ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_forwarder_driver ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_forwarder_driver_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_forwarder_img ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_forwarder_import ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_forwarder_import2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_forwarder_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_forwarder_jmf_tmp ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_forwarder_prepare ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_forwarder_tran_th_h ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_forwarder_tran_th_sub ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_header_order ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_history_key ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_hs_rate_custom_cbm ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_hs_rate_custom_kg ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_keyword_product ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_log_forwarder_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_notify ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_notify_read ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_notify_sheet_ctt ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_notify_wp ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_order ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_org_email_ships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_org_line_ships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_org_tell_ships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_org_wechat_ships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_organization_domainname ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_organization_email ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_organization_line ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_organization_tell ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_organization_wechat ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_otp_check ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_page_name ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_payment ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_pcs_logged ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_post_job ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_pro_valentine ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_product ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_product_category ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_promotion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_promotion33 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_rate_custom_cbm ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_rate_custom_kg ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_rate_g_cbm ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_rate_g_kg ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_rate_vip_cbm ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_rate_vip_kg ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_receipt ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_receipt_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_register ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_sales_report ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_set_comm_interpreter ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_shop_pay_h ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_shop_pay_sub ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_sms_hs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_sms_statistic ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_sms_statistic9 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_survey ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_survey202306 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_terms_service ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_tmp_forwarder_cargothai ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_tmp_forwarder_item_cargothai ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_tmp_forwarder_item_momo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_tmp_forwarder_momo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_tmp_profile_admin ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_user_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_user_sales_admin_pay ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_user_sales_pay ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_users_otp ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_users_otp_hs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_wallet ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_wallet_hs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_wallet_paydeposit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_web_hs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_withdraw_comm_interpreter_h ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_withdraw_comm_interpreter_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_withdraw_comm_sale_h ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_withdraw_comm_sale_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_youtude ENABLE ROW LEVEL SECURITY;
